/**
 * Batch lookup of public player profiles by wallet address.
 * Used by lobby past-match feed when per-match Redis keys expired.
 */
import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import {
  getAddressProfiles,
  relayStorageMode,
} from "@/lib/profileStore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("addresses") || "";
  const addresses = raw
    .split(/[, ]+/)
    .map((a) => a.trim().toLowerCase())
    .filter((a) => isAddress(a))
    .slice(0, 80);

  if (addresses.length === 0) {
    return NextResponse.json({
      profiles: {},
      storage: relayStorageMode(),
    });
  }

  try {
    const profiles = await getAddressProfiles(addresses);
    return NextResponse.json({
      profiles,
      storage: relayStorageMode(),
    });
  } catch (e) {
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : "Failed to load profiles",
        profiles: {},
      },
      { status: 500 }
    );
  }
}
