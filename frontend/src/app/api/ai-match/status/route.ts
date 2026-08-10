import { NextResponse } from "next/server";
import {
  getAiHouseAddress,
  isAiHouseConfigured,
} from "@/lib/aiHouseWallet";

// Must read AGENT_PRIVATE_KEY at request time (never bake "offline" at build)
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const revalidate = 0;

/** Public: is stake-vs-Agent available on this deployment? */
export async function GET() {
  const configured = isAiHouseConfigured();
  const house = getAiHouseAddress();
  return NextResponse.json(
    {
      configured,
      houseAddress: house,
      agentAddress: house,
      ready: configured && !!house,
      /** true only when AGENT_PRIVATE_KEY (or AI_HOUSE_PRIVATE_KEY) is set server-side */
      hasPrivateKey: configured,
      checkedAt: new Date().toISOString(),
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    }
  );
}
