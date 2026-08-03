import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http, isAddress, type Chain } from "viem";
import { ADDRESSES, whotEscrowAbi } from "@/lib/contracts";
import {
  appendRelayAction,
  getRelay,
  isGameAction,
  setRelay,
} from "@/lib/relayStore";
import type { GameAction } from "@/lib/whot/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Minimal Base chain (avoid importing full viem/chains bundle) */
const baseChain = {
  id: 8453,
  name: "Base",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://mainnet.base.org"] } },
} as const satisfies Chain;

const client = createPublicClient({
  chain: baseChain,
  transport: http(
    process.env.BASE_RPC_URL ||
      process.env.NEXT_PUBLIC_BASE_RPC ||
      "https://mainnet.base.org"
  ),
});

function parseMatchId(raw: string): bigint | null {
  try {
    if (!/^\d+$/.test(raw)) return null;
    return BigInt(raw);
  } catch {
    return null;
  }
}

async function loadMatch(matchId: bigint) {
  return client.readContract({
    address: ADDRESSES.whotEscrow,
    abi: whotEscrowAbi,
    functionName: "getMatch",
    args: [matchId],
  }) as Promise<{
    player1: `0x${string}`;
    player2: `0x${string}`;
    status: number;
    gameSeed: `0x${string}`;
  }>;
}

/** GET /api/match/:id/moves — full action log for both clients */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ matchId: string }> | { matchId: string } }
) {
  const params = await Promise.resolve(ctx.params);
  const id = parseMatchId(params.matchId);
  if (id === null) {
    return NextResponse.json({ error: "Invalid match id" }, { status: 400 });
  }

  try {
    // Ensure match exists on-chain (status Active = 2 or Waiting = 1)
    const m = await loadMatch(id);
    if (!m || m.status === 0) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }

    const payload = await getRelay(params.matchId);
    return NextResponse.json({
      matchId: params.matchId,
      actions: payload.actions,
      updatedAt: payload.updatedAt,
      status: m.status,
      gameSeed: m.gameSeed,
      player1: m.player1,
      player2: m.player2,
    });
  } catch (e) {
    console.error("GET moves", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load moves" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/match/:id/moves
 * body: { address: 0x…, action: GameAction }
 * Only player1 / player2 of an Active match may append.
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ matchId: string }> | { matchId: string } }
) {
  const params = await Promise.resolve(ctx.params);
  const id = parseMatchId(params.matchId);
  if (id === null) {
    return NextResponse.json({ error: "Invalid match id" }, { status: 400 });
  }

  let body: { address?: string; action?: unknown; replace?: GameAction[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const address = (body.address || "").toLowerCase();
  if (!isAddress(address)) {
    return NextResponse.json({ error: "Valid address required" }, { status: 400 });
  }

  try {
    const m = await loadMatch(id);
    if (!m || m.status !== 2) {
      // 2 = Active
      return NextResponse.json(
        { error: "Match is not active" },
        { status: 400 }
      );
    }

    const p1 = m.player1.toLowerCase();
    const p2 = m.player2.toLowerCase();
    if (address !== p1 && address !== p2) {
      return NextResponse.json(
        { error: "Only match players can post moves" },
        { status: 403 }
      );
    }

    // Full replace (recovery / rare) — must still be a player
    if (Array.isArray(body.replace)) {
      const actions = body.replace.filter(isGameAction);
      const payload = { actions, updatedAt: Date.now() };
      await setRelay(params.matchId, payload);
      return NextResponse.json({
        matchId: params.matchId,
        actions: payload.actions,
        updatedAt: payload.updatedAt,
      });
    }

    if (!isGameAction(body.action)) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    const action = body.action as GameAction;
    // Player can only act as themselves
    const slot = address === p1 ? "p1" : "p2";
    if (action.player !== slot) {
      return NextResponse.json(
        { error: "Action player does not match wallet" },
        { status: 403 }
      );
    }

    // Optional: reject if not their turn based on current log length (light check)
    const cur = await getRelay(params.matchId);
    // Don't allow huge spam
    if (cur.actions.length > 500) {
      return NextResponse.json({ error: "Match log too long" }, { status: 400 });
    }

    const next = await appendRelayAction(params.matchId, action);
    return NextResponse.json({
      matchId: params.matchId,
      actions: next.actions,
      updatedAt: next.updatedAt,
    });
  } catch (e) {
    console.error("POST moves", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to post move" },
      { status: 500 }
    );
  }
}
