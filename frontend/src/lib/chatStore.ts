/**
 * Match chat storage (same backend as move relay: Upstash / Vercel KV / memory).
 */

import {
  relayStorageMode,
  upstashCommand,
  upstashConfigured,
} from "@/lib/relayStore";

export type ChatMessage = {
  id: string;
  address: string;
  name: string;
  text: string;
  at: number;
};

export type ChatPayload = {
  messages: ChatMessage[];
  updatedAt: number;
};

const g = globalThis as unknown as {
  __whotChat?: Map<string, ChatPayload>;
};

const MAX_MESSAGES = 120;
const MAX_TEXT = 280;

function mem(): Map<string, ChatPayload> {
  if (!g.__whotChat) g.__whotChat = new Map();
  return g.__whotChat;
}

function chatKey(matchId: string) {
  return `whotwhot:chat:${matchId}`;
}

export function sanitizeChatText(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, MAX_TEXT);
}

function mergeChatPayload(a: ChatPayload, b: ChatPayload): ChatPayload {
  const byId = new Map<string, ChatMessage>();
  for (const m of a.messages || []) byId.set(m.id, m);
  for (const m of b.messages || []) byId.set(m.id, m);
  const messages = Array.from(byId.values())
    .sort((x, y) => x.at - y.at)
    .slice(-MAX_MESSAGES);
  return {
    messages,
    updatedAt: Math.max(a.updatedAt || 0, b.updatedAt || 0, Date.now()),
  };
}

export async function getChat(matchId: string): Promise<ChatPayload> {
  const local = mem().get(matchId) || { messages: [], updatedAt: 0 };
  if (upstashConfigured()) {
    try {
      const data = await upstashCommand(["GET", chatKey(matchId)]);
      const raw = data?.result;
      if (!raw || typeof raw !== "string") {
        return local; // keep instance memory if Redis empty
      }
      const parsed = JSON.parse(raw) as ChatPayload;
      const remote: ChatPayload = {
        messages: Array.isArray(parsed.messages) ? parsed.messages : [],
        updatedAt: Number(parsed.updatedAt) || 0,
      };
      const merged = mergeChatPayload(local, remote);
      mem().set(matchId, merged);
      return merged;
    } catch (e) {
      console.error("chat get", e);
      return local;
    }
  }
  return local;
}

export async function setChat(
  matchId: string,
  payload: ChatPayload
): Promise<void> {
  mem().set(matchId, payload);
  if (upstashConfigured()) {
    try {
      await upstashCommand([
        "SET",
        chatKey(matchId),
        JSON.stringify(payload),
        "EX",
        604800,
      ]);
    } catch (e) {
      console.error("chat set", e);
    }
  }
}

export async function appendChatMessage(
  matchId: string,
  msg: ChatMessage
): Promise<ChatPayload> {
  const cur = await getChat(matchId);
  // Dedup exact same message id
  if (cur.messages.some((m) => m.id === msg.id)) return cur;
  const messages = [...cur.messages, msg].slice(-MAX_MESSAGES);
  const next: ChatPayload = { messages, updatedAt: Date.now() };
  await setChat(matchId, next);
  return next;
}

export { relayStorageMode, MAX_TEXT };
