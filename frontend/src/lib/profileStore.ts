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

function mergePayload(
  a: ProfilesPayload,
  b: ProfilesPayload
): ProfilesPayload {
  const profiles = { ...a.profiles };
  for (const [k, p] of Object.entries(b.profiles || {})) {
    const key = k.toLowerCase();
    const old = profiles[key];
    if (!old || (p.updatedAt || 0) >= (old.updatedAt || 0)) {
      profiles[key] = { ...old, ...p, address: key };
    }
  }
  return {
    profiles,
    updatedAt: Math.max(a.updatedAt || 0, b.updatedAt || 0, Date.now()),
  };
}

export async function getMatchProfiles(
  matchId: string
): Promise<ProfilesPayload> {
  const local = mem().get(matchId) || { profiles: {}, updatedAt: 0 };
  if (upstashConfigured()) {
    try {
      const data = await upstashCommand(["GET", key(matchId)]);
      const raw = data?.result;
      if (!raw || typeof raw !== "string") {
        // Don't discard instance memory when Redis is empty
        return local;
      }
      const remote = JSON.parse(raw) as ProfilesPayload;
      const merged = mergePayload(local, remote);
      mem().set(matchId, merged);
      return merged;
    } catch {
      return local;
    }
  }
  return local;
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
    try {
      await upstashCommand([
        "SET",
        key(matchId),
        JSON.stringify(next),
        "EX",
        604800,
      ]);
    } catch (e) {
      // Large photo may exceed Redis limit — retry without data-URL avatar
      console.error("profile redis set", e);
      const slim: ProfilesPayload = {
        profiles: {},
        updatedAt: next.updatedAt,
      };
      for (const [k, p] of Object.entries(next.profiles)) {
        slim.profiles[k] = {
          ...p,
          avatar:
            p.avatar?.startsWith("data:image") && p.avatar.length > 8000
              ? "🃏"
              : p.avatar,
        };
      }
      try {
        await upstashCommand([
          "SET",
          key(matchId),
          JSON.stringify(slim),
          "EX",
          604800,
        ]);
        mem().set(matchId, slim);
        return slim;
      } catch (e2) {
        console.error("profile redis set slim", e2);
      }
    }
  }
  return next;
}

export { relayStorageMode };
