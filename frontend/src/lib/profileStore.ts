/**
 * Server-side profile store for a match (so both players see each other's ID).
 */

import {
  relayStorageMode,
  upstashCommand,
  upstashConfigured,
} from "@/lib/relayStore";

export type SharedProfile = {
  address: string;
  username: string;
  avatar: string;
  color: string;
  updatedAt: number;
};

export type ProfilesPayload = {
  profiles: Record<string, SharedProfile>;
  updatedAt: number;
};

const g = globalThis as unknown as {
  __whotProfiles?: Map<string, ProfilesPayload>;
};

function mem(): Map<string, ProfilesPayload> {
  if (!g.__whotProfiles) g.__whotProfiles = new Map();
  return g.__whotProfiles;
}

function key(matchId: string) {
  return `whotwhot:profiles:${matchId}`;
}

export async function getMatchProfiles(
  matchId: string
): Promise<ProfilesPayload> {
  if (upstashConfigured()) {
    try {
      const data = await upstashCommand(["GET", key(matchId)]);
      const raw = data?.result;
      if (!raw || typeof raw !== "string") {
        return { profiles: {}, updatedAt: 0 };
      }
      return JSON.parse(raw) as ProfilesPayload;
    } catch {
      return mem().get(matchId) || { profiles: {}, updatedAt: 0 };
    }
  }
  return mem().get(matchId) || { profiles: {}, updatedAt: 0 };
}

export async function upsertMatchProfile(
  matchId: string,
  profile: SharedProfile
): Promise<ProfilesPayload> {
  const cur = await getMatchProfiles(matchId);
  const next: ProfilesPayload = {
    profiles: {
      ...cur.profiles,
      [profile.address.toLowerCase()]: {
        ...profile,
        address: profile.address.toLowerCase(),
        updatedAt: Date.now(),
      },
    },
    updatedAt: Date.now(),
  };
  mem().set(matchId, next);
  if (upstashConfigured()) {
    await upstashCommand([
      "SET",
      key(matchId),
      JSON.stringify(next),
      "EX",
      604800,
    ]);
  }
  return next;
}

export { relayStorageMode };
