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
  // Diagnostics only — never return secret values
  const hasAgentKey = Boolean(process.env.AGENT_PRIVATE_KEY?.trim());
  const hasLegacyKey = Boolean(process.env.AI_HOUSE_PRIVATE_KEY?.trim());
  const hasPrivateKeyEnv = Boolean(process.env.PRIVATE_KEY?.trim());
  return NextResponse.json(
    {
      configured,
      houseAddress: house,
      agentAddress: house,
      ready: configured && !!house,
      /** true when AGENT_PRIVATE_KEY or AI_HOUSE_PRIVATE_KEY is set server-side */
      hasPrivateKey: configured,
      env: {
        AGENT_PRIVATE_KEY: hasAgentKey,
        AI_HOUSE_PRIVATE_KEY: hasLegacyKey,
        /** Deploy key name — not used for Agent unless aliased */
        PRIVATE_KEY: hasPrivateKeyEnv,
      },
      checkedAt: new Date().toISOString(),
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    }
  );
}
