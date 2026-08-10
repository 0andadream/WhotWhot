import { NextRequest, NextResponse } from "next/server";
import { encodeFunctionData } from "viem";
import { ADDRESSES, MatchStatus, whotEscrowAbi } from "@/lib/contracts";
import { getAiHouseWalletClient } from "@/lib/aiHouseWallet";
import {
  ensureEscrowApproval,
  ensureHouseTicket,
} from "@/lib/aiHouseTickets";

/**
 * Agent joins a Waiting match: buys/uses a Megapot ticket and joinMatch.
 * Player must already have createMatch'd (player1).
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { matchId?: string };
    const matchIdStr = body.matchId?.trim();
    if (!matchIdStr || !/^\d+$/.test(matchIdStr)) {
      return NextResponse.json({ error: "matchId required" }, { status: 400 });
    }
    const matchId = BigInt(matchIdStr);

    const houseCtx = getAiHouseWalletClient();
    if (!houseCtx) {
      return NextResponse.json(
        {
          error:
            "Agent wallet not configured. Set AGENT_PRIVATE_KEY (or AI_HOUSE_PRIVATE_KEY) on the server for 0xFD3f…ef2f0.",
        },
        { status: 503 }
      );
    }
    const { account, wallet, publicClient } = houseCtx;
    const house = account.address;

    const m = (await publicClient.readContract({
      address: ADDRESSES.whotEscrow,
      abi: whotEscrowAbi,
      functionName: "getMatch",
      args: [matchId],
    })) as {
      player1: `0x${string}`;
      player2: `0x${string}`;
      ticket1: bigint;
      status: number;
      gameSeed: `0x${string}`;
    };

    if (m.status !== MatchStatus.Waiting) {
      // Already active — if house is p2, treat as success (retry)
      if (
        m.status === MatchStatus.Active &&
        m.player2.toLowerCase() === house.toLowerCase()
      ) {
        return NextResponse.json({
          ok: true,
          matchId: matchIdStr,
          houseAddress: house,
          gameSeed: m.gameSeed,
          alreadyJoined: true,
        });
      }
      return NextResponse.json(
        { error: `Match not waiting (status ${m.status})` },
        { status: 409 }
      );
    }

    if (m.player1.toLowerCase() === house.toLowerCase()) {
      return NextResponse.json(
        { error: "Agent cannot play itself" },
        { status: 400 }
      );
    }

    const ticketId = await ensureHouseTicket({
      publicClient,
      wallet,
      account,
    });
    if (ticketId === BigInt(m.ticket1)) {
      return NextResponse.json(
        { error: "Agent ticket collides with player ticket" },
        { status: 409 }
      );
    }

    await ensureEscrowApproval({ publicClient, wallet, account });

    const joinHash = await wallet.sendTransaction({
      account,
      chain: publicClient.chain,
      to: ADDRESSES.whotEscrow,
      data: encodeFunctionData({
        abi: whotEscrowAbi,
        functionName: "joinMatch",
        args: [matchId, ticketId],
      }),
    });
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: joinHash,
    });
    if (receipt.status !== "success") {
      return NextResponse.json(
        { error: "joinMatch failed on-chain", hash: joinHash },
        { status: 502 }
      );
    }

    const after = (await publicClient.readContract({
      address: ADDRESSES.whotEscrow,
      abi: whotEscrowAbi,
      functionName: "getMatch",
      args: [matchId],
    })) as {
      gameSeed: `0x${string}`;
      player2: `0x${string}`;
      ticket2: bigint;
      status: number;
    };

    return NextResponse.json({
      ok: true,
      matchId: matchIdStr,
      houseAddress: house,
      houseTicketId: after.ticket2?.toString?.() || ticketId.toString(),
      gameSeed: after.gameSeed,
      joinHash,
      status: after.status,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "AI join failed";
    console.error("[ai-match/join]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
