import { NextResponse } from "next/server";
import { redisEnvDiagnostics } from "@/lib/relayStore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Public health check — no secrets.
 * Open https://whotwhot.xyz/api/health after redeploy.
 */
export async function GET() {
  const d = redisEnvDiagnostics();
  return NextResponse.json({
    ok: true,
    storage: d.storage,
    redisReady: d.hasRestUrl && d.hasRestToken,
    hasRestUrl: d.hasRestUrl,
    hasRestToken: d.hasRestToken,
    /** Which env var NAMES are set (not values) */
    keysPresent: d.keysPresent,
    hint:
      d.hasRestUrl && d.hasRestToken
        ? "Redis looks configured. Multiplayer chat/moves should use storage=redis."
        : "Missing Upstash REST URL and/or TOKEN on this deployment. In Vercel → Settings → Environment Variables, add UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN for Production, then Redeploy.",
  });
}
