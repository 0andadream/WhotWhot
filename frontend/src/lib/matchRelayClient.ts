import type { GameAction } from "@/lib/whot/types";
import type { Address } from "viem";

export type RelayResponse = {
  matchId: string;
  actions: GameAction[];
  updatedAt: number;
  status?: number;
  gameSeed?: string;
  player1?: string;
  player2?: string;
  error?: string;
  storage?: "redis" | "memory";
  warning?: string;
  metaSource?: string;
};

const LS_PREFIX = "whotwhot:relay:";

export function loadLocalRelay(matchId: string): GameAction[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LS_PREFIX + matchId);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { actions?: GameAction[] };
    return Array.isArray(parsed.actions) ? parsed.actions : [];
  } catch {
    return [];
  }
}

export function saveLocalRelay(matchId: string, actions: GameAction[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      LS_PREFIX + matchId,
      JSON.stringify({ actions, updatedAt: Date.now() })
    );
  } catch {
    /* quota */
  }
}

async function parseRelayResponse(res: Response): Promise<RelayResponse> {
  const text = await res.text();
  let data: RelayResponse;
  try {
    data = JSON.parse(text) as RelayResponse;
  } catch {
    throw new Error(
      res.ok
        ? "Relay returned invalid JSON"
        : `Relay ${res.status}: ${text.slice(0, 120) || res.statusText}`
    );
  }
  if (!res.ok) {
    throw new Error(data.error || `Relay ${res.status}`);
  }
  return data;
}

export async function fetchRelayMoves(
  matchId: string
): Promise<RelayResponse> {
  const res = await fetch(`/api/match/${matchId}/moves`, {
    cache: "no-store",
  });
  return parseRelayResponse(res);
}

export async function postRelayMove(
  matchId: string,
  address: Address,
  action: GameAction
): Promise<RelayResponse> {
  const res = await fetch(`/api/match/${matchId}/moves`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address, action }),
  });
  return parseRelayResponse(res);
}

/** Push full local log if server is behind (recovery after RPC blips). */
export async function pushRelayReplace(
  matchId: string,
  address: Address,
  actions: GameAction[]
): Promise<RelayResponse> {
  const res = await fetch(`/api/match/${matchId}/moves`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address, replace: actions }),
  });
  return parseRelayResponse(res);
}
