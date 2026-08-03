/**
 * Match action log helpers.
 * Multiplayer state is driven by on-chain MovePosted events (see match page).
 * localStorage is only a local cache / same-browser backup.
 */

import type { GameAction } from "@/lib/whot/types";

const key = (matchId: string) => `whotwhot:moves:${matchId}`;

export function loadMatchActions(matchId: string): GameAction[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(key(matchId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as GameAction[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveMatchActions(matchId: string, actions: GameAction[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key(matchId), JSON.stringify(actions));
  } catch {
    /* ignore */
  }
}

export function appendMatchAction(matchId: string, action: GameAction) {
  if (typeof window === "undefined") return;
  const prev = loadMatchActions(matchId);
  prev.push(action);
  saveMatchActions(matchId, prev);
}

export function isGameAction(x: unknown): x is GameAction {
  if (!x || typeof x !== "object") return false;
  const t = (x as GameAction).type;
  return t === "PLAY_CARD" || t === "DRAW" || t === "ACCEPT_PENALTY";
}
