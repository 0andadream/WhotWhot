"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccount } from "wagmi";
import type { Address } from "viem";
import { getProfile, type PlayerProfile } from "@/lib/profile";

export type SharedProfile = {
  address: string;
  username: string;
  avatar: string;
  color: string;
};

/**
 * Publish local profile to match + poll opponent profiles.
 */
export function useMatchProfiles(matchId: string | null, enabled: boolean) {
  const { address } = useAccount();
  const [profiles, setProfiles] = useState<Record<string, SharedProfile>>({});

  const publish = useCallback(async () => {
    if (!matchId || !address || !enabled) return;
    const local = getProfile(address);
    if (!local) return;
    try {
      const res = await fetch(`/api/match/${matchId}/profiles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address,
          username: local.username,
          avatar: local.avatar,
          color: local.color,
        }),
      });
      if (!res.ok) return;
      const data = (await res.json()) as {
        profiles?: Record<string, SharedProfile>;
      };
      if (data.profiles) setProfiles(data.profiles);
    } catch {
      /* ignore */
    }
  }, [matchId, address, enabled]);

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
      if (data.profiles) setProfiles(data.profiles);
    } catch {
      /* ignore */
    }
  }, [matchId, enabled]);

  useEffect(() => {
    if (!enabled || !matchId) return;
    void publish();
    void pull();
    const id = window.setInterval(() => {
      void publish();
      void pull();
    }, 4000);
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
