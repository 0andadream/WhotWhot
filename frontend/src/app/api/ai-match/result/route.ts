import { NextRequest, NextResponse } from "next/server";
import { encodeFunctionData, isAddress, getAddress, type Hash } from "viem";
import { base } from "viem/chains";
import { ADDRESSES, MatchStatus, whotEscrowAbi } from "@/lib/contracts";
import { getAiHouseWalletClient } from "@/lib/aiHouseWallet";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ZERO = "0x0000000000000000000000000000000000000000";

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

/**
 * Agent dual-confirms the match winner so both tickets transfer.
 * Retries transient RPC / nonce races that often fail on the first attempt.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      matchId?: string;
      winner?: string;
    };
    const matchIdStr = body.matchId?.trim();
    const winnerRaw = body.winner?.trim();
    if (!matchIdStr || !/^\d+$/.test(matchIdStr)) {
      return NextResponse.json({ error: "matchId required" }, { status: 400 });
    }
    if (!winnerRaw || !isAddress(winnerRaw)) {
      return NextResponse.json(
        { error: "winner address required" },
        { status: 400 }
      );
    }
    const winner = getAddress(winnerRaw);
    const matchId = BigInt(matchIdStr);

    const houseCtx = getAiHouseWalletClient();
    if (!houseCtx) {
      return NextResponse.json(
        {
          error:
            "Agent wallet not configured. Set AGENT_PRIVATE_KEY on the server.",
        },
        { status: 503 }
      );
    }
    const { account, wallet, publicClient } = houseCtx;
    const house = getAddress(account.address);

    const readMatch = async () =>
      (await publicClient.readContract({
        address: ADDRESSES.whotEscrow,
        abi: whotEscrowAbi,
        functionName: "getMatch",
        args: [matchId],
      })) as {
        player1: `0x${string}`;
        player2: `0x${string}`;
        status: number;
        player1Result: `0x${string}`;
        player2Result: `0x${string}`;
      };

    // Wait briefly for player submitResult to land (client often fires us immediately after wallet)
    let m = await readMatch();
    for (let i = 0; i < 8; i++) {
      if (m.status === MatchStatus.Resolved) {
        return NextResponse.json({ ok: true, alreadyResolved: true });
      }
      if (m.status === MatchStatus.Active) break;
      await sleep(1500);
      m = await readMatch();
    }

    if (m.status === MatchStatus.Resolved) {
      return NextResponse.json({ ok: true, alreadyResolved: true });
    }
    if (m.status !== MatchStatus.Active) {
      return NextResponse.json(
        { error: `Match not active (status ${m.status})` },
        { status: 409 }
      );
    }

    const p1 = getAddress(m.player1);
    const p2 = getAddress(m.player2);
    if (house !== p1 && house !== p2) {
      return NextResponse.json(
        { error: "Agent is not a player in this match" },
        { status: 403 }
      );
    }
    if (winner !== p1 && winner !== p2) {
      return NextResponse.json(
        { error: "Winner must be player1 or player2" },
        { status: 400 }
      );
    }

    const houseIsP1 = house === p1;
    const houseResult = houseIsP1 ? m.player1Result : m.player2Result;
    if (houseResult && houseResult.toLowerCase() !== ZERO) {
      if (getAddress(houseResult) === winner) {
        // Player may still need to submit — wait a bit for resolve
        for (let i = 0; i < 6; i++) {
          const mid = await readMatch();
          if (mid.status === MatchStatus.Resolved) {
            return NextResponse.json({
              ok: true,
              alreadySubmitted: true,
              resolved: true,
            });
          }
          await sleep(2000);
        }
        return NextResponse.json({
          ok: true,
          alreadySubmitted: true,
          resolved: false,
        });
      }
    }

    const alreadySet =
      houseResult && houseResult.toLowerCase() !== ZERO
        ? getAddress(houseResult) !== winner
        : false;

    const fn = alreadySet ? "updateResult" : "submitResult";

    let lastErr: string | null = null;
    let hash: Hash | null = null;

    for (let attempt = 1; attempt <= 4; attempt++) {
      try {
        // Re-read before each try (status / prior submit may change)
        m = await readMatch();
        if (m.status === MatchStatus.Resolved) {
          return NextResponse.json({
            ok: true,
            alreadyResolved: true,
            attempts: attempt,
          });
        }
        const cur = houseIsP1 ? m.player1Result : m.player2Result;
        if (cur && cur.toLowerCase() !== ZERO && getAddress(cur) === winner) {
          hash = null;
          break;
        }

        const useFn =
          cur && cur.toLowerCase() !== ZERO ? "updateResult" : "submitResult";

        hash = await wallet.sendTransaction({
          account,
          chain: base,
          to: ADDRESSES.whotEscrow,
          data: encodeFunctionData({
            abi: whotEscrowAbi,
            functionName: useFn,
            args: [matchId, winner],
          }),
        });

        const receipt = await publicClient.waitForTransactionReceipt({
          hash,
          confirmations: 1,
          timeout: 120_000,
        });
        if (receipt.status !== "success") {
          lastErr = `${useFn} reverted (${hash})`;
          await sleep(1500 * attempt);
          continue;
        }
        lastErr = null;
        break;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        lastErr = msg;
        // Already submitted by a prior attempt / concurrent call
        if (/AlreadySubmitted|already submitted/i.test(msg)) {
          lastErr = null;
          break;
        }
        console.error(`[ai-match/result] attempt ${attempt}:`, msg);
        await sleep(1500 * attempt);
      }
    }

    if (lastErr) {
      return NextResponse.json(
        { error: lastErr, fn },
        { status: 500 }
      );
    }

    // Poll until dual-confirm resolves (player may submit right after us)
    let resolved = false;
    for (let i = 0; i < 10; i++) {
      const after = await readMatch();
      if (after.status === MatchStatus.Resolved) {
        resolved = true;
        break;
      }
      await sleep(2000);
    }

    return NextResponse.json({
      ok: true,
      hash,
      resolved,
      status: (await readMatch()).status,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Agent result failed";
    console.error("[ai-match/result]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
