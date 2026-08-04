/**
 * Client-side cache + merge for match profiles & chat.
 * Prevents "shows then disappears" when a cold serverless instance
 * returns empty memory (or Redis blips) on poll.
 */

import type { ChatMessage } from "@/lib/matchChatClient";

export type CachedProfile = {
  address: string;
  username: string;
  avatar: string;
  color: string;
  updatedAt?: number;
};

function profilesKey(matchId: string) {
  return `whotwhot:shareProfiles:${matchId}`;
}
function chatKey(matchId: string) {
  return `whotwhot:shareChat:${matchId}`;
}

export function loadCachedProfiles(
  matchId: string
): Record<string, CachedProfile> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(profilesKey(matchId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, CachedProfile>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function saveCachedProfiles(
  matchId: string,
  profiles: Record<string, CachedProfile>
) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(profilesKey(matchId), JSON.stringify(profiles));
  } catch {
    /* quota — drop heavy avatars and retry once */
    try {
      const slim: Record<string, CachedProfile> = {};
      for (const [k, p] of Object.entries(profiles)) {
        slim[k] = {
          ...p,
          avatar:
            p.avatar && p.avatar.startsWith("data:image")
              ? "🃏"
              : p.avatar || "🃏",
        };
      }
      localStorage.setItem(profilesKey(matchId), JSON.stringify(slim));
    } catch {
      /* ignore */
    }
  }
}

/** Merge server + local profiles; never wipe known players with empty polls */
export function mergeProfiles(
  prev: Record<string, CachedProfile>,
  incoming: Record<string, CachedProfile> | undefined | null
): Record<string, CachedProfile> {
  const next = incoming || {};
  if (Object.keys(next).length === 0) return prev;

  const out: Record<string, CachedProfile> = { ...prev };
  for (const [k, p] of Object.entries(next)) {
    if (!p) continue;
    const key = k.toLowerCase();
    const old = out[key];
    const incomingAt = Number(p.updatedAt) || 0;
    const oldAt = Number(old?.updatedAt) || 0;

    if (!old) {
      out[key] = { ...p, address: key };
      continue;
    }

    // Prefer newer; keep richer avatar if newer has empty/short one
    const preferIncoming = incomingAt >= oldAt;
    const base = preferIncoming ? { ...old, ...p } : { ...p, ...old };
    const avatar =
      (p.avatar &&
        (!old.avatar ||
          p.avatar.length >= old.avatar.length ||
          preferIncoming)) ||
      !old.avatar
        ? p.avatar || old.avatar
        : old.avatar || p.avatar;

    out[key] = {
      address: key,
      username: base.username || old.username,
      avatar: avatar || "🃏",
      color: base.color || old.color || "#c41e3a",
      updatedAt: Math.max(incomingAt, oldAt, Date.now()),
    };
  }
  return out;
}

export function loadCachedChat(matchId: string): ChatMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(chatKey(matchId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { messages?: ChatMessage[] };
    return Array.isArray(parsed.messages) ? parsed.messages : [];
  } catch {
    return [];
  }
}

export function saveCachedChat(matchId: string, messages: ChatMessage[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      chatKey(matchId),
      JSON.stringify({ messages: messages.slice(-120), updatedAt: Date.now() })
    );
  } catch {
    /* ignore */
  }
}

/**
 * Merge chat lists by id. Never drop messages just because a poll returned fewer.
 * Dedupes optimistic local-* messages that match a real server message.
 */
export function mergeChatMessages(
  prev: ChatMessage[],
  incoming: ChatMessage[] | undefined | null
): ChatMessage[] {
  const next = incoming || [];
  if (next.length === 0) return prev;

  const byId = new Map<string, ChatMessage>();
  for (const m of prev) byId.set(m.id, m);
  for (const m of next) byId.set(m.id, m);

  // Drop optimistic locals that were confirmed (same address+text+~time)
  const list = Array.from(byId.values());
  const confirmed = list.filter((m) => !m.id.startsWith("local-"));
  const locals = list.filter((m) => m.id.startsWith("local-"));
  const keptLocals = locals.filter((loc) => {
    return !confirmed.some(
      (c) =>
        c.address.toLowerCase() === loc.address.toLowerCase() &&
        c.text === loc.text &&
        Math.abs(c.at - loc.at) < 60_000
    );
  });

  return [...confirmed, ...keptLocals].sort((a, b) => a.at - b.at).slice(-120);
}
