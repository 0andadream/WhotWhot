import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import {
  appendRelayAction,
  getRelay,
  isGameAction,
  relayStorageMode,
  setRelay,
  setRelayOutcome,
  type RelayOutcome,
} from "@/lib/relayStore";
import { loadMatchMeta, rememberMatchMeta } from "@/lib/matchMetaCache";
import type { GameAction, PlayerId } from "@/lib/whot/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function parseMatchId(raw: string): bigint | null {
  try {
    if (!/^\d+$/.test(raw)) return null;
    return BigInt(raw);
  } catch {
    return null;
  }
}

function shortRpcError(msg: string): string {
  if (/rate limit|over rate/i.test(msg)) {
    return "Base RPC rate limited. Retry in a moment.";
  }
  if (msg.length > 160) return msg.slice(0, 160) + "…";
  return msg;
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
    const payload = await getRelay(params.matchId);
    const { meta, from, error: rpcError } = await loadMatchMeta(
      params.matchId,
      id
    );

    // Soft-fail: still return moves if RPC is down (cached meta or none)
    if (!meta) {
      // Unknown match vs RPC blip: if we never saw it and log empty, 404-ish
      if (payload.actions.length === 0 && payload.updatedAt === 0) {
        return NextResponse.json(
          {
            error: shortRpcError(
              rpcError || "Could not load match (RPC). Try again."
            ),
            storage: relayStorageMode(),
          },
          { status: 503 }
        );
      }
      return NextResponse.json({
        matchId: params.matchId,
        actions: payload.actions,
        updatedAt: payload.updatedAt,
        storage: relayStorageMode(),
        metaSource: "none",
        warning: rpcError ? shortRpcError(rpcError) : undefined,
      });
    }

    if (meta.status === 0) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }

    return NextResponse.json({
      matchId: params.matchId,
      actions: payload.actions,
      updatedAt: payload.updatedAt,
      outcome: payload.outcome || null,
      status: meta.status,
      gameSeed: meta.gameSeed,
      player1: meta.player1,
      player2: meta.player2,
      storage: relayStorageMode(),
      metaSource: from,
      warning: rpcError ? shortRpcError(rpcError) : undefined,
    });
  } catch (e) {
    console.error("GET moves", e);
    // Last resort: return empty-ok only if we can still read relay
    try {
      const payload = await getRelay(params.matchId);
      return NextResponse.json({
        matchId: params.matchId,
        actions: payload.actions,
        updatedAt: payload.updatedAt,
        storage: relayStorageMode(),
        warning: shortRpcError(
          e instanceof Error ? e.message : "Failed to load moves"
        ),
      });
    } catch {
      return NextResponse.json(
        {
          error: e instanceof Error ? e.message : "Failed to load moves",
          storage: relayStorageMode(),
        },
        { status: 500 }
      );
    }
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

  let body: {
    address?: string;
    action?: unknown;
    replace?: GameAction[];
    outcome?: { winner?: string; reason?: string };
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const address = (body.address || "").toLowerCase();
  if (!isAddress(address)) {
    return NextResponse.json(
      { error: "Valid address required" },
      { status: 400 }
    );
  }

  try {
    // Prefer cache; force refresh if missing or not Active (stale Waiting is common after join)
    let { meta, error: rpcError } = await loadMatchMeta(params.matchId, id);
    const statusNum = () => (meta ? Number(meta.status) : -1);
    if (!meta || statusNum() !== 2) {
      const retry = await loadMatchMeta(params.matchId, id, {
        forceRefresh: true,
      });
      if (retry.meta) meta = retry.meta;
      if (retry.error) rpcError = retry.error;
    }

    if (!meta) {
      return NextResponse.json(
        {
          error: shortRpcError(
            rpcError || "Could not verify match (RPC rate limit). Retry."
          ),
          storage: relayStorageMode(),
        },
        { status: 503 }
      );
    }

    if (statusNum() !== 2) {
      return NextResponse.json(
        {
          error:
            statusNum() === 1
              ? "Match still waiting for opponent"
              : "Match is not active",
          status: statusNum(),
          storage: relayStorageMode(),
        },
        { status: 400 }
      );
    }

    const p1 = meta.player1.toLowerCase();
    const p2 = meta.player2.toLowerCase();
    if (address !== p1 && address !== p2) {
      return NextResponse.json(
        { error: "Only match players can post moves" },
        { status: 403 }
      );
    }

    rememberMatchMeta(params.matchId, meta);

    // Declare shared outcome (timeout forfeit) so opponent can confirm on-chain
    if (body.outcome?.winner === "p1" || body.outcome?.winner === "p2") {
      const outcome: RelayOutcome = {
        winner: body.outcome.winner as PlayerId,
        reason:
          body.outcome.reason === "game" || body.outcome.reason === "forfeit"
            ? body.outcome.reason
            : "timeout",
        by: address,
        at: Date.now(),
      };
      const next = await setRelayOutcome(params.matchId, outcome);
      return NextResponse.json({
        matchId: params.matchId,
        actions: next.actions,
        updatedAt: next.updatedAt,
        outcome: next.outcome,
        storage: relayStorageMode(),
      });
    }

    // Full replace (recovery) — must still be a player
    if (Array.isArray(body.replace)) {
      const cur = await getRelay(params.matchId);
      const actions = body.replace.filter(isGameAction);
      const payload = {
        actions,
        updatedAt: Date.now(),
        outcome: cur.outcome || null,
      };
      await setRelay(params.matchId, payload);
      return NextResponse.json({
        matchId: params.matchId,
        actions: payload.actions,
        updatedAt: payload.updatedAt,
        outcome: payload.outcome,
        storage: relayStorageMode(),
      });
    }

    if (!isGameAction(body.action)) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    const action = body.action as GameAction;
    const slot = address === p1 ? "p1" : "p2";
    if (action.player !== slot) {
      return NextResponse.json(
        { error: "Action player does not match wallet" },
        { status: 403 }
      );
    }

    const cur = await getRelay(params.matchId);
    if (cur.actions.length > 500) {
      return NextResponse.json({ error: "Match log too long" }, { status: 400 });
    }

    // Dedup: ignore exact last action (double-tap / double poll race)
    const last = cur.actions[cur.actions.length - 1];
    if (last && JSON.stringify(last) === JSON.stringify(action)) {
      return NextResponse.json({
        matchId: params.matchId,
        actions: cur.actions,
        updatedAt: cur.updatedAt,
        outcome: cur.outcome || null,
        storage: relayStorageMode(),
        deduped: true,
      });
    }

    const next = await appendRelayAction(params.matchId, action);
    return NextResponse.json({
      matchId: params.matchId,
      outcome: next.outcome || null,
      actions: next.actions,
      updatedAt: next.updatedAt,
      storage: relayStorageMode(),
    });
  } catch (e) {
    console.error("POST moves", e);
    return NextResponse.json(
      {
        error: shortRpcError(
          e instanceof Error ? e.message : "Failed to post move"
        ),
        storage: relayStorageMode(),
      },
      { status: 500 }
    );
  }
}
