import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import {
  appendChatMessage,
  getChat,
  MAX_TEXT,
  relayStorageMode,
  sanitizeChatText,
  type ChatMessage,
} from "@/lib/chatStore";
import { loadMatchMeta, rememberMatchMeta } from "@/lib/matchMetaCache";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function parseMatchId(raw: string): bigint | null {
  try {
    if (!/^\d+$/.test(raw)) return null;
    return BigInt(raw);
  } catch {
    return null;
  }
}

function shortRpcError(msg: string): string {
  if (/rate limit|over rate/i.test(msg)) {
    return "Base RPC rate limited. Retry in a moment.";
  }
  if (msg.length > 160) return msg.slice(0, 160) + "…";
  return msg;
}

/** GET /api/match/:id/chat */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ matchId: string }> | { matchId: string } }
) {
  const params = await Promise.resolve(ctx.params);
  const id = parseMatchId(params.matchId);
  if (id === null) {
    return NextResponse.json({ error: "Invalid match id" }, { status: 400 });
  }

  try {
    const payload = await getChat(params.matchId);
    const { meta } = await loadMatchMeta(params.matchId, id);

    return NextResponse.json({
      matchId: params.matchId,
      messages: payload.messages,
      updatedAt: payload.updatedAt,
      status: meta?.status,
      storage: relayStorageMode(),
    });
  } catch (e) {
    console.error("GET chat", e);
    try {
      const payload = await getChat(params.matchId);
      return NextResponse.json({
        matchId: params.matchId,
        messages: payload.messages,
        updatedAt: payload.updatedAt,
        storage: relayStorageMode(),
      });
    } catch {
      return NextResponse.json(
        {
          error: e instanceof Error ? e.message : "Failed to load chat",
          storage: relayStorageMode(),
        },
        { status: 500 }
      );
    }
  }
}

/**
 * POST /api/match/:id/chat
 * body: { address, name?, text }
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ matchId: string }> | { matchId: string } }
) {
  const params = await Promise.resolve(ctx.params);
  const id = parseMatchId(params.matchId);
  if (id === null) {
    return NextResponse.json({ error: "Invalid match id" }, { status: 400 });
  }

  let body: { address?: string; name?: string; text?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const address = (body.address || "").toLowerCase();
  if (!isAddress(address)) {
    return NextResponse.json(
      { error: "Valid address required" },
      { status: 400 }
    );
  }

  const text = sanitizeChatText(body.text || "");
  if (!text) {
    return NextResponse.json({ error: "Message is empty" }, { status: 400 });
  }
  if (text.length > MAX_TEXT) {
    return NextResponse.json(
      { error: `Max ${MAX_TEXT} characters` },
      { status: 400 }
    );
  }

  try {
    let { meta, error: rpcError } = await loadMatchMeta(params.matchId, id);
    if (!meta) {
      const retry = await loadMatchMeta(params.matchId, id, {
        forceRefresh: true,
      });
      meta = retry.meta;
      rpcError = retry.error;
    }

    if (!meta) {
      return NextResponse.json(
        {
          error: shortRpcError(
            rpcError || "Could not verify match. Retry."
          ),
          storage: relayStorageMode(),
        },
        { status: 503 }
      );
    }

    // Allow chat while waiting (table open) or active; not after cancel/resolve optional
    // Keep chat open after resolve for a bit of trash talk / coord
    if (meta.status === 0) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }

    const p1 = meta.player1.toLowerCase();
    const p2 = meta.player2.toLowerCase();
    if (address !== p1 && address !== p2) {
      return NextResponse.json(
        { error: "Only match players can chat" },
        { status: 403 }
      );
    }

    rememberMatchMeta(params.matchId, meta);

    const nameRaw = (body.name || "").trim().slice(0, 24);
    const name =
      nameRaw ||
      `${address.slice(0, 6)}…${address.slice(-4)}`;

    const msg: ChatMessage = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      address,
      name,
      text,
      at: Date.now(),
    };

    const next = await appendChatMessage(params.matchId, msg);
    return NextResponse.json({
      matchId: params.matchId,
      messages: next.messages,
      updatedAt: next.updatedAt,
      storage: relayStorageMode(),
    });
  } catch (e) {
    console.error("POST chat", e);
    return NextResponse.json(
      {
        error: shortRpcError(
          e instanceof Error ? e.message : "Failed to send message"
        ),
        storage: relayStorageMode(),
      },
      { status: 500 }
    );
  }
}
