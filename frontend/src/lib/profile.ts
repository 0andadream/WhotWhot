/**
 * Player profile: username + avatar, keyed by wallet.
 * Used as identity when playing with friends.
 */

export type PlayerProfile = {
  address: string;
  username: string;
  /** Emoji avatar or short preset key */
  avatar: string;
  /** Accent color for fallback initials */
  color: string;
  updatedAt: number;
};

const PROFILE_KEY = "whotwhot:profile";
const PROFILES_BY_ADDR = "whotwhot:profilesByAddress";

export const AVATAR_PRESETS = [
  "🃏",
  "⭐",
  "🔥",
  "👑",
  "🦁",
  "🦅",
  "🎯",
  "💚",
  "🎲",
  "🇳🇬",
  "⚡",
  "🌟",
];

export const COLOR_PRESETS = [
  "#c41e3a",
  "#0e7c41",
  "#3b82f6",
  "#eab308",
  "#a855f7",
  "#f97316",
  "#06b6d4",
  "#ec4899",
];

export function sanitizeUsername(name: string): string {
  return name
    .replace(/[^\p{L}\p{N}\s._-]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 20);
}

function readMap(): Record<string, PlayerProfile> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(PROFILES_BY_ADDR) || "{}") as Record<
      string,
      PlayerProfile
    >;
  } catch {
    return {};
  }
}

function writeMap(map: Record<string, PlayerProfile>) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(PROFILES_BY_ADDR, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

export function getProfile(address?: string | null): PlayerProfile | null {
  if (!address || typeof window === "undefined") return null;
  const key = address.toLowerCase();
  const map = readMap();
  if (map[key]) return map[key];
  // Legacy single-name fallback
  try {
    const legacy = (localStorage.getItem("whotwhot:displayName") || "").trim();
    if (legacy) {
      return {
        address: key,
        username: sanitizeUsername(legacy),
        avatar: AVATAR_PRESETS[0],
        color: COLOR_PRESETS[0],
        updatedAt: Date.now(),
      };
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function hasCompleteProfile(address?: string | null): boolean {
  const p = getProfile(address);
  return !!(p && p.username && p.username.length >= 2);
}

export function saveProfile(
  address: string,
  data: { username: string; avatar: string; color: string }
): PlayerProfile {
  const username = sanitizeUsername(data.username);
  if (username.length < 2) {
    throw new Error("Username must be at least 2 characters");
  }
  const profile: PlayerProfile = {
    address: address.toLowerCase(),
    username,
    avatar: data.avatar || AVATAR_PRESETS[0],
    color: data.color || COLOR_PRESETS[0],
    updatedAt: Date.now(),
  };
  const map = readMap();
  map[profile.address] = profile;
  writeMap(map);
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    localStorage.setItem("whotwhot:displayName", username);
  } catch {
    /* ignore */
  }
  return profile;
}

export function shortWallet(address: string): string {
  if (!address || address.length < 10) return address || "";
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
