import { NextRequest, NextResponse } from "next/server";
import {
  getTableCodeMatchId,
  relayStorageMode,
  setTableCodeMatchId,
} from "@/lib/tableCodeStore";
import { isValidTableCode, normalizeTableCode } from "@/lib/tableCode";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET ?code=K7M2XP → { matchId } */
export async function GET(req: NextRequest) {
  const code = normalizeTableCode(req.nextUrl.searchParams.get("code") || "");
  if (!isValidTableCode(code)) {
    return NextResponse.json({ error: "Invalid table code" }, { status: 400 });
  }
  const matchId = await getTableCodeMatchId(code);
  if (!matchId) {
    return NextResponse.json({ error: "Code not found" }, { status: 404 });
  }
  return NextResponse.json({
    code,
    matchId,
    storage: relayStorageMode(),
  });
}

/** POST { code, matchId } — bind shareable code after match create */
export async function POST(req: NextRequest) {
  let body: { code?: string; matchId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const code = normalizeTableCode(body.code || "");
  const matchId = (body.matchId || "").trim();

  if (!isValidTableCode(code)) {
    return NextResponse.json(
      { error: "Table code must be 4–10 letters/numbers (not only digits)" },
      { status: 400 }
    );
  }
  if (!/^\d+$/.test(matchId)) {
    return NextResponse.json({ error: "Invalid match id" }, { status: 400 });
  }

  const existing = await getTableCodeMatchId(code);
  if (existing && existing !== matchId) {
    return NextResponse.json(
      { error: "That table code is already in use" },
      { status: 409 }
    );
  }

  await setTableCodeMatchId(code, matchId);
  return NextResponse.json({
    code,
    matchId,
    storage: relayStorageMode(),
  });
}
