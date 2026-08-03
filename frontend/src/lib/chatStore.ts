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

export async function getChat(matchId: string): Promise<ChatPayload> {
  if (upstashConfigured()) {
    try {
      const data = await upstashCommand(["GET", chatKey(matchId)]);
      const raw = data?.result;
      if (!raw || typeof raw !== "string") {
        return { messages: [], updatedAt: 0 };
      }
      const parsed = JSON.parse(raw) as ChatPayload;
      return {
        messages: Array.isArray(parsed.messages) ? parsed.messages : [],
        updatedAt: Number(parsed.updatedAt) || 0,
      };
    } catch (e) {
      console.error("chat get", e);
      return mem().get(matchId) || { messages: [], updatedAt: 0 };
    }
  }
  return mem().get(matchId) || { messages: [], updatedAt: 0 };
}

export async function setChat(
  matchId: string,
  payload: ChatPayload
): Promise<void> {
  mem().set(matchId, payload);
  if (upstashConfigured()) {
    await upstashCommand([
      "SET",
      chatKey(matchId),
      JSON.stringify(payload),
      "EX",
      604800,
    ]);
  }
}

export async function appendChatMessage(
  matchId: string,
  msg: ChatMessage
): Promise<ChatPayload> {
  const cur = await getChat(matchId);
  const messages = [...cur.messages, msg].slice(-MAX_MESSAGES);
  const next: ChatPayload = { messages, updatedAt: Date.now() };
  await setChat(matchId, next);
  return next;
}

export { relayStorageMode, MAX_TEXT };
