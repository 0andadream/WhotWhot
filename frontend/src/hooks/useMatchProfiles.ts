"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";
import { getProfile, type PlayerProfile } from "@/lib/profile";
import {
  loadCachedProfiles,
  mergeProfiles,
  saveCachedProfiles,
  type CachedProfile,
} from "@/lib/matchShareCache";

export type SharedProfile = {
  address: string;
  username: string;
  avatar: string;
  color: string;
  updatedAt?: number;
};

/**
 * Publish local profile to match + poll opponent profiles.
 * Merges results and uses localStorage so empty serverless polls never wipe UI.
 */
export function useMatchProfiles(matchId: string | null, enabled: boolean) {
  const { address } = useAccount();
  const [profiles, setProfiles] = useState<Record<string, SharedProfile>>({});
  const profilesRef = useRef(profiles);
  profilesRef.current = profiles;
  const lastPublishRef = useRef("");

  const applyProfiles = useCallback(
    (incoming: Record<string, SharedProfile> | undefined | null) => {
      if (!matchId) return;
      setProfiles((prev) => {
        const merged = mergeProfiles(
          prev as Record<string, CachedProfile>,
          incoming as Record<string, CachedProfile> | null
        );
        saveCachedProfiles(matchId, merged);
        return merged;
      });
    },
    [matchId]
  );

  const publish = useCallback(async () => {
    if (!matchId || !address || !enabled) return;
    const local = getProfile(address);
    if (!local) return;

    // Always keep own profile visible even if POST fails
    applyProfiles({
      [address.toLowerCase()]: {
        address: address.toLowerCase(),
        username: local.username,
        avatar: local.avatar,
        color: local.color,
        updatedAt: Date.now(),
      },
    });

    const body = {
      address,
      username: local.username,
      avatar: local.avatar,
      color: local.color,
    };
    const sig = JSON.stringify({
      u: local.username,
      a: local.avatar.slice(0, 64),
      c: local.color,
    });

    try {
      const res = await fetch(`/api/match/${matchId}/profiles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        // Retry once with emoji-only avatar if payload too large / failed
        if (local.avatar.startsWith("data:image")) {
          const retry = await fetch(`/api/match/${matchId}/profiles`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...body, avatar: "🃏" }),
          });
          if (retry.ok) {
            const data = (await retry.json()) as {
              profiles?: Record<string, SharedProfile>;
            };
            applyProfiles(data.profiles);
          }
        }
        return;
      }
      lastPublishRef.current = sig;
      const data = (await res.json()) as {
        profiles?: Record<string, SharedProfile>;
      };
      applyProfiles(data.profiles);
    } catch {
      /* keep local merge */
    }
  }, [matchId, address, enabled, applyProfiles]);

  const pull = useCallback(async () => {
    if (!matchId || !enabled) return;
    try {
      const res = await fetch(`/api/match/${matchId}/profiles`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as {
        profiles?: Record<string, SharedProfile>;
      };
      // Never replace with empty — merge only
      if (data.profiles && Object.keys(data.profiles).length > 0) {
        applyProfiles(data.profiles);
      }
    } catch {
      /* ignore */
    }
  }, [matchId, enabled, applyProfiles]);

  // Hydrate from localStorage on match open
  useEffect(() => {
    if (!matchId || !enabled) return;
    const cached = loadCachedProfiles(matchId);
    if (Object.keys(cached).length) {
      setProfiles(cached);
    }
  }, [matchId, enabled]);

  useEffect(() => {
    if (!enabled || !matchId) return;
    void publish();
    void pull();
    const id = window.setInterval(() => {
      void publish();
      void pull();
    }, 5000);
    return () => window.clearInterval(id);
  }, [enabled, matchId, publish, pull]);

  const forAddress = useCallback(
    (addr?: string | null): SharedProfile | PlayerProfile | null => {
      if (!addr) return null;
      const key = addr.toLowerCase();
      if (profiles[key]) return profiles[key];
      if (address && key === address.toLowerCase()) return getProfile(address);
      return null;
    },
    [profiles, address]
  );

  return { profiles, forAddress, publish, pull };
}

export function useLocalProfile() {
  const { address, isConnected } = useAccount();
  const [profile, setProfile] = useState<PlayerProfile | null>(null);

  const refresh = useCallback(() => {
    setProfile(isConnected && address ? getProfile(address) : null);
  }, [isConnected, address]);

  useEffect(() => {
    refresh();
    const onSave = () => refresh();
    window.addEventListener("whotwhot:profileSaved", onSave);
    return () => window.removeEventListener("whotwhot:profileSaved", onSave);
  }, [refresh]);

  return { profile, refresh };
}
