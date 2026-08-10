import { NextRequest, NextResponse } from "next/server";
import { encodeFunctionData, isAddress, getAddress } from "viem";
import { ADDRESSES, MatchStatus, whotEscrowAbi } from "@/lib/contracts";
import { getAiHouseWalletClient } from "@/lib/aiHouseWallet";

/**
 * AI house dual-confirms the match winner so both tickets transfer.
 * Call after the human has submitted (or house submits first — either order works).
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
        { error: "AI house wallet not configured" },
        { status: 503 }
      );
    }
    const { account, wallet, publicClient } = houseCtx;
    const house = getAddress(account.address);

    const m = (await publicClient.readContract({
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
        { error: "House is not a player in this match" },
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
    const already = houseIsP1 ? m.player1Result : m.player2Result;
    const zero = "0x0000000000000000000000000000000000000000";
    if (already && already.toLowerCase() !== zero) {
      if (getAddress(already) === winner) {
        return NextResponse.json({ ok: true, alreadySubmitted: true });
      }
      // updateResult if house needs to change
      const updHash = await wallet.sendTransaction({
        account,
        chain: publicClient.chain,
        to: ADDRESSES.whotEscrow,
        data: encodeFunctionData({
          abi: whotEscrowAbi,
          functionName: "updateResult",
          args: [matchId, winner],
        }),
      });
      await publicClient.waitForTransactionReceipt({ hash: updHash });
      return NextResponse.json({ ok: true, updated: true, hash: updHash });
    }

    const hash = await wallet.sendTransaction({
      account,
      chain: publicClient.chain,
      to: ADDRESSES.whotEscrow,
      data: encodeFunctionData({
        abi: whotEscrowAbi,
        functionName: "submitResult",
        args: [matchId, winner],
      }),
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") {
      return NextResponse.json(
        { error: "submitResult failed", hash },
        { status: 502 }
      );
    }

    const after = (await publicClient.readContract({
      address: ADDRESSES.whotEscrow,
      abi: whotEscrowAbi,
      functionName: "getMatch",
      args: [matchId],
    })) as { status: number };

    return NextResponse.json({
      ok: true,
      hash,
      resolved: after.status === MatchStatus.Resolved,
      status: after.status,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "AI result failed";
    console.error("[ai-match/result]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
