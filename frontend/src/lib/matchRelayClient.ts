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
};

export async function fetchRelayMoves(
  matchId: string
): Promise<RelayResponse> {
  const res = await fetch(`/api/match/${matchId}/moves`, {
    cache: "no-store",
  });
  const data = (await res.json()) as RelayResponse;
  if (!res.ok) {
    throw new Error(data.error || `Relay GET ${res.status}`);
  }
  return data;
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
  const data = (await res.json()) as RelayResponse;
  if (!res.ok) {
    throw new Error(data.error || `Relay POST ${res.status}`);
  }
  return data;
}
