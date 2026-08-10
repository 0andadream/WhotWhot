import { NextResponse } from "next/server";
import {
  getAiHouseAddress,
  isAiHouseConfigured,
} from "@/lib/aiHouseWallet";

/** Public: is stake-vs-AI available on this deployment? */
export async function GET() {
  const configured = isAiHouseConfigured();
  const house = getAiHouseAddress();
  return NextResponse.json({
    configured,
    houseAddress: house,
    ready: configured && !!house,
  });
}
