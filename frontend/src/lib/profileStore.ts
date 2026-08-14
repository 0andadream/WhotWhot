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
  __whotAddrProfiles?: Map<string, SharedProfile>;
};

function mem(): Map<string, ProfilesPayload> {
  if (!g.__whotProfiles) g.__whotProfiles = new Map();
  return g.__whotProfiles;
}

function addrMem(): Map<string, SharedProfile> {
  if (!g.__whotAddrProfiles) g.__whotAddrProfiles = new Map();
  return g.__whotAddrProfiles;
}

function key(matchId: string) {
  return `whotwhot:profiles:${matchId}`;
}

function addrKey(address: string) {
  return `whotwhot:profile:addr:${address.toLowerCase()}`;
}

/** Keep global address profiles longer than match-scoped (lobby past feed). */
const ADDR_TTL_SEC = 60 * 60 * 24 * 90; // 90 days
const MATCH_TTL_SEC = 604800; // 7 days

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

function slimAvatar(avatar: string | undefined): string {
  if (
    avatar?.startsWith("data:image") &&
    avatar.length > 8000
  ) {
    return "🃏";
  }
  return avatar || "🃏";
}

/** Persist profile by wallet for site-wide past match feed. */
export async function upsertAddressProfile(
  profile: SharedProfile
): Promise<SharedProfile> {
  const address = profile.address.toLowerCase();
  const next: SharedProfile = {
    ...profile,
    address,
    updatedAt: Date.now(),
  };
  const prev = addrMem().get(address);
  if (prev && (prev.updatedAt || 0) > (next.updatedAt || 0)) {
    return prev;
  }
  // Prefer richer avatar when same/newer
  if (
    prev &&
    prev.avatar?.startsWith("data:image") &&
    !next.avatar?.startsWith("data:image")
  ) {
    next.avatar = prev.avatar;
  }
  addrMem().set(address, next);
  if (upstashConfigured()) {
    try {
      await upstashCommand([
        "SET",
        addrKey(address),
        JSON.stringify(next),
        "EX",
        ADDR_TTL_SEC,
      ]);
    } catch (e) {
      console.error("addr profile redis set", e);
      try {
        const slim = { ...next, avatar: slimAvatar(next.avatar) };
        await upstashCommand([
          "SET",
          addrKey(address),
          JSON.stringify(slim),
          "EX",
          ADDR_TTL_SEC,
        ]);
        addrMem().set(address, slim);
        return slim;
      } catch (e2) {
        console.error("addr profile redis set slim", e2);
      }
    }
  }
  return next;
}

export async function getAddressProfiles(
  addresses: string[]
): Promise<Record<string, SharedProfile>> {
  const out: Record<string, SharedProfile> = {};
  const unique = [
    ...new Set(
      addresses
        .map((a) => a?.toLowerCase?.() || "")
        .filter((a) => a.startsWith("0x") && a.length === 42)
    ),
  ];
  if (unique.length === 0) return out;

  for (const a of unique) {
    const local = addrMem().get(a);
    if (local) out[a] = local;
  }

  if (upstashConfigured()) {
    await Promise.all(
      unique.map(async (a) => {
        try {
          const data = await upstashCommand(["GET", addrKey(a)]);
          const raw = data?.result;
          if (!raw || typeof raw !== "string") return;
          const remote = JSON.parse(raw) as SharedProfile;
          if (!remote?.username) return;
          const prev = out[a];
          if (!prev || (remote.updatedAt || 0) >= (prev.updatedAt || 0)) {
            out[a] = { ...remote, address: a };
            addrMem().set(a, out[a]!);
          }
        } catch {
          /* ignore */
        }
      })
    );
  }
  return out;
}

export async function upsertMatchProfile(
  matchId: string,
  profile: SharedProfile
): Promise<ProfilesPayload> {
  const addr = profile.address.toLowerCase();
  const stored: SharedProfile = {
    ...profile,
    address: addr,
    updatedAt: Date.now(),
  };
  // Always mirror to address index (lobby past feed)
  void upsertAddressProfile(stored);

  const cur = await getMatchProfiles(matchId);
  const next: ProfilesPayload = {
    profiles: {
      ...cur.profiles,
      [addr]: stored,
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
        MATCH_TTL_SEC,
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
          avatar: slimAvatar(p.avatar),
        };
      }
      try {
        await upstashCommand([
          "SET",
          key(matchId),
          JSON.stringify(slim),
          "EX",
          MATCH_TTL_SEC,
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
