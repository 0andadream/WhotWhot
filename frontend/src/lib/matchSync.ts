/**
 * Local multiplayer move sync (no gas).
 * Both players share a match id; we store the action log in localStorage.
 * Same-device / shared browser works; cross-device needs a later relay.
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

export function appendMatchAction(matchId: string, action: GameAction) {
  if (typeof window === "undefined") return;
  try {
    const prev = loadMatchActions(matchId);
    prev.push(action);
    localStorage.setItem(key(matchId), JSON.stringify(prev));
    // Notify other tabs on same origin
    window.dispatchEvent(
      new CustomEvent("whotwhot:move", { detail: { matchId, action } })
    );
  } catch {
    /* ignore quota */
  }
}

export function clearMatchActions(matchId: string) {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(key(matchId));
  } catch {
    /* */
  }
}
