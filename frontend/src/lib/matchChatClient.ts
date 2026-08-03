import type { Address } from "viem";

export type ChatMessage = {
  id: string;
  address: string;
  name: string;
  text: string;
  at: number;
};

export type ChatResponse = {
  matchId: string;
  messages: ChatMessage[];
  updatedAt: number;
  status?: number;
  storage?: "redis" | "memory";
  error?: string;
};

async function parse(res: Response): Promise<ChatResponse> {
  const text = await res.text();
  let data: ChatResponse;
  try {
    data = JSON.parse(text) as ChatResponse;
  } catch {
    throw new Error(
      res.ok
        ? "Chat returned invalid JSON"
        : `Chat ${res.status}: ${text.slice(0, 100) || res.statusText}`
    );
  }
  if (!res.ok) {
    throw new Error(data.error || `Chat ${res.status}`);
  }
  return data;
}

export async function fetchChat(matchId: string): Promise<ChatResponse> {
  const res = await fetch(`/api/match/${matchId}/chat`, { cache: "no-store" });
  return parse(res);
}

export async function postChat(
  matchId: string,
  address: Address,
  text: string,
  name?: string
): Promise<ChatResponse> {
  const res = await fetch(`/api/match/${matchId}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address, text, name }),
  });
  return parse(res);
}
