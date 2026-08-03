import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import {
  getMatchProfiles,
  relayStorageMode,
  upsertMatchProfile,
} from "@/lib/profileStore";
import { loadMatchMeta, rememberMatchMeta } from "@/lib/matchMetaCache";
import { sanitizeUsername } from "@/lib/profile";

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

/** GET profiles for a match */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ matchId: string }> | { matchId: string } }
) {
  const params = await Promise.resolve(ctx.params);
  const id = parseMatchId(params.matchId);
  if (id === null) {
    return NextResponse.json({ error: "Invalid match id" }, { status: 400 });
  }
  const payload = await getMatchProfiles(params.matchId);
  return NextResponse.json({
    matchId: params.matchId,
    profiles: payload.profiles,
    updatedAt: payload.updatedAt,
    storage: relayStorageMode(),
  });
}

/**
 * POST publish your profile into this match so the opponent sees username/avatar.
 * body: { address, username, avatar, color }
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

  let body: {
    address?: string;
    username?: string;
    avatar?: string;
    color?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const address = (body.address || "").toLowerCase();
  if (!isAddress(address)) {
    return NextResponse.json({ error: "Valid address required" }, { status: 400 });
  }

  const username = sanitizeUsername(body.username || "");
  if (username.length < 2) {
    return NextResponse.json(
      { error: "Username required (min 2 chars)" },
      { status: 400 }
    );
  }

  try {
    let { meta } = await loadMatchMeta(params.matchId, id);
    if (!meta) {
      const retry = await loadMatchMeta(params.matchId, id, {
        forceRefresh: true,
      });
      meta = retry.meta;
    }
    if (!meta || meta.status === 0) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }
    const p1 = meta.player1.toLowerCase();
    const p2 = meta.player2.toLowerCase();
    if (address !== p1 && address !== p2) {
      return NextResponse.json(
        { error: "Only match players can publish profile" },
        { status: 403 }
      );
    }
    rememberMatchMeta(params.matchId, meta);

    const next = await upsertMatchProfile(params.matchId, {
      address,
      username,
      avatar: (body.avatar || "🃏").slice(0, 8),
      color: (body.color || "#c41e3a").slice(0, 16),
      updatedAt: Date.now(),
    });

    return NextResponse.json({
      matchId: params.matchId,
      profiles: next.profiles,
      updatedAt: next.updatedAt,
      storage: relayStorageMode(),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to save profile" },
      { status: 500 }
    );
  }
}
