/**
 * Match move relay storage.
 * - Production: Upstash / Vercel KV REST
 * - Local / no Redis: in-memory Map (works for `next dev` only)
 *
 * Vercel multiplayer requires Redis env so both players share one log.
 */

import type { GameAction } from "@/lib/whot/types";

export type RelayPayload = {
  actions: GameAction[];
  updatedAt: number;
};

const g = globalThis as unknown as {
  __whotRelay?: Map<string, RelayPayload>;
};

function mem(): Map<string, RelayPayload> {
  if (!g.__whotRelay) g.__whotRelay = new Map();
  return g.__whotRelay;
}

/** Accept Upstash classic names or Vercel KV marketplace names */
export function upstashConfigured(): boolean {
  return !!(redisUrl() && redisToken());
}

function redisUrl(): string | undefined {
  return (
    process.env.UPSTASH_REDIS_REST_URL ||
    process.env.KV_REST_API_URL ||
    process.env.KV_URL ||
    undefined
  );
}

function redisToken(): string | undefined {
  return (
    process.env.UPSTASH_REDIS_REST_TOKEN ||
    process.env.KV_REST_API_TOKEN ||
    process.env.KV_REST_API_READ_ONLY_TOKEN ||
    undefined
  );
}

export function relayStorageMode(): "redis" | "memory" {
  return upstashConfigured() ? "redis" : "memory";
}

export async function upstashCommand(
  command: (string | number)[]
): Promise<{ result: unknown }> {
  const base = redisUrl()!.replace(/\/$/, "");
  const res = await fetch(base, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${redisToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
    cache: "no-store",
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Upstash ${res.status}: ${t}`);
  }
  return res.json() as Promise<{ result: unknown }>;
}

function redisKey(matchId: string) {
  return `whotwhot:relay:${matchId}`;
}

export async function getRelay(matchId: string): Promise<RelayPayload> {
  if (upstashConfigured()) {
    try {
      const data = await upstashCommand(["GET", redisKey(matchId)]);
      const raw = data?.result;
      if (!raw || typeof raw !== "string") {
        return { actions: [], updatedAt: 0 };
      }
      const parsed = JSON.parse(raw) as RelayPayload;
      return {
        actions: Array.isArray(parsed.actions) ? parsed.actions : [],
        updatedAt: Number(parsed.updatedAt) || 0,
      };
    } catch (e) {
      console.error("relay get upstash", e);
      // Fall through to memory so a Redis blip does not wipe a warm instance
      return mem().get(matchId) || { actions: [], updatedAt: 0 };
    }
  }
  return mem().get(matchId) || { actions: [], updatedAt: 0 };
}

export async function setRelay(
  matchId: string,
  payload: RelayPayload
): Promise<void> {
  // Always keep memory warm for this instance
  mem().set(matchId, payload);

  if (upstashConfigured()) {
    const body = JSON.stringify(payload);
    // 7 day TTL
    await upstashCommand(["SET", redisKey(matchId), body, "EX", 604800]);
  }
}

export async function appendRelayAction(
  matchId: string,
  action: GameAction
): Promise<RelayPayload> {
  const cur = await getRelay(matchId);
  const next: RelayPayload = {
    actions: [...cur.actions, action],
    updatedAt: Date.now(),
  };
  await setRelay(matchId, next);
  return next;
}

export function isGameAction(x: unknown): x is GameAction {
  if (!x || typeof x !== "object") return false;
  const t = (x as GameAction).type;
  return t === "PLAY_CARD" || t === "DRAW" || t === "ACCEPT_PENALTY";
}
