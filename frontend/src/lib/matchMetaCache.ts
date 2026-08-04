/**
 * Cache on-chain match metadata so the move relay does not hit Base RPC
 * on every poll (public RPCs rate-limit → 500 → "Relay sync issue").
 */

import type { Address } from "viem";
import { getBasePublicClient } from "@/lib/baseRpc";
import { ADDRESSES, whotEscrowAbi } from "@/lib/contracts";
import {
  upstashCommand,
  upstashConfigured,
} from "@/lib/relayStore";

export type MatchMeta = {
  player1: Address;
  player2: Address;
  status: number;
  gameSeed: `0x${string}`;
  cachedAt: number;
};

const MEM_TTL_MS = 180_000; // 3 minutes
const REDIS_META_TTL_SEC = 600; // 10 minutes

const g = globalThis as unknown as {
  __whotMatchMeta?: Map<string, MatchMeta>;
};

function mem(): Map<string, MatchMeta> {
  if (!g.__whotMatchMeta) g.__whotMatchMeta = new Map();
  return g.__whotMatchMeta;
}

function metaKey(matchId: string) {
  return `whotwhot:matchmeta:${matchId}`;
}

async function readRedisMeta(matchId: string): Promise<MatchMeta | null> {
  if (!upstashConfigured()) return null;
  try {
    const data = await upstashCommand(["GET", metaKey(matchId)]);
    const raw = data?.result;
    if (!raw || typeof raw !== "string") return null;
    const parsed = JSON.parse(raw) as MatchMeta;
    if (!parsed?.player1 || parsed.status === undefined) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writeRedisMeta(matchId: string, meta: MatchMeta): Promise<void> {
  if (!upstashConfigured()) return;
  try {
    await upstashCommand([
      "SET",
      metaKey(matchId),
      JSON.stringify(meta),
      "EX",
      REDIS_META_TTL_SEC,
    ]);
  } catch {
    /* ignore */
  }
}

async function fetchOnChain(matchId: bigint): Promise<MatchMeta> {
  const client = getBasePublicClient();
  const m = (await client.readContract({
    address: ADDRESSES.whotEscrow,
    abi: whotEscrowAbi,
    functionName: "getMatch",
    args: [matchId],
  })) as {
    player1: Address;
    player2: Address;
    status: number;
    gameSeed: `0x${string}`;
  };
  return {
    player1: m.player1,
    player2: m.player2,
    status: m.status,
    gameSeed: m.gameSeed,
    cachedAt: Date.now(),
  };
}

export async function loadMatchMeta(
  matchId: string,
  matchIdBig: bigint,
  opts?: { forceRefresh?: boolean }
): Promise<{
  meta: MatchMeta | null;
  from: "memory" | "redis" | "chain" | "none";
  error?: string;
}> {
  const force = !!opts?.forceRefresh;

  if (!force) {
    const hit = mem().get(matchId);
    // Waiting tables flip to Active on join — keep a short TTL so posts aren't blocked
    const ttl =
      hit && Number(hit.status) === 1 ? 8_000 : MEM_TTL_MS;
    if (hit && Date.now() - hit.cachedAt < ttl) {
      return { meta: hit, from: "memory" };
    }
    const redis = await readRedisMeta(matchId);
    if (redis) {
      // Don't trust long-lived Waiting meta from Redis after join
      const redisAge = Date.now() - (redis.cachedAt || 0);
      if (Number(redis.status) === 1 && redisAge > 8_000) {
        /* fall through to chain */
      } else {
        mem().set(matchId, { ...redis, cachedAt: Date.now() });
        return { meta: redis, from: "redis" };
      }
    }
  }

  try {
    const meta = await fetchOnChain(matchIdBig);
    mem().set(matchId, meta);
    void writeRedisMeta(matchId, meta);
    return { meta, from: "chain" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "RPC failed";
    const stale = mem().get(matchId) || (await readRedisMeta(matchId));
    if (stale) {
      return {
        meta: stale,
        from: mem().has(matchId) ? "memory" : "redis",
        error: msg,
      };
    }
    return { meta: null, from: "none", error: msg };
  }
}

export function rememberMatchMeta(matchId: string, meta: MatchMeta) {
  const next = { ...meta, cachedAt: Date.now() };
  mem().set(matchId, next);
  void writeRedisMeta(matchId, next);
}
