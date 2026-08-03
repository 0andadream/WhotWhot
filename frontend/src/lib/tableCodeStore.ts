/**
 * Server store: short table code → match id (7 day TTL).
 */

import {
  relayStorageMode,
  upstashCommand,
  upstashConfigured,
} from "@/lib/relayStore";

const g = globalThis as unknown as {
  __whotTableCodes?: Map<string, string>;
};

function mem(): Map<string, string> {
  if (!g.__whotTableCodes) g.__whotTableCodes = new Map();
  return g.__whotTableCodes;
}

function key(code: string) {
  return `whotwhot:tablecode:${code.toUpperCase()}`;
}

export async function getTableCodeMatchId(
  code: string
): Promise<string | null> {
  const c = code.toUpperCase();
  if (upstashConfigured()) {
    try {
      const data = await upstashCommand(["GET", key(c)]);
      const raw = data?.result;
      if (typeof raw === "string" && raw) return raw;
      return null;
    } catch {
      return mem().get(c) || null;
    }
  }
  return mem().get(c) || null;
}

export async function setTableCodeMatchId(
  code: string,
  matchId: string
): Promise<void> {
  const c = code.toUpperCase();
  mem().set(c, matchId);
  if (upstashConfigured()) {
    await upstashCommand(["SET", key(c), matchId, "EX", 604800]);
  }
}

export { relayStorageMode };
