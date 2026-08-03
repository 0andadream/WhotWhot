/**
 * After a user views draw results for a no-win (or finished) ticket,
 * we hide that NFT from stake pickers and ticket counts so it does not
 * look like a fresh bet. Results remain on the match tickets page history.
 */

const KEY = "whotwhot:seenDrawnTickets";

function readSet(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return new Set(Array.isArray(arr) ? arr.map(String) : []);
  } catch {
    return new Set();
  }
}

function writeSet(set: Set<string>) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify([...set]));
  } catch {
    /* quota */
  }
}

export function isDrawnTicketHidden(ticketId: bigint | string): boolean {
  return readSet().has(String(ticketId));
}

export function markDrawnTicketSeen(ticketId: bigint | string) {
  const set = readSet();
  const id = String(ticketId);
  if (set.has(id)) return;
  set.add(id);
  writeSet(set);
}

export function markDrawnTicketsSeen(ticketIds: (bigint | string)[]) {
  const set = readSet();
  let changed = false;
  for (const t of ticketIds) {
    const id = String(t);
    if (!set.has(id)) {
      set.add(id);
      changed = true;
    }
  }
  if (changed) {
    writeSet(set);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("whotwhot:seenDrawn"));
    }
  }
}

/** Optional: clear (debug / tests) */
export function clearSeenDrawnTickets() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(KEY);
}
