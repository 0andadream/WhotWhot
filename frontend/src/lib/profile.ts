/**
 * Player profile: username + avatar, keyed by wallet.
 * Used as identity when playing with friends.
 * Avatar may be an emoji preset or a data:image/* URL from gallery upload.
 */

export type PlayerProfile = {
  address: string;
  username: string;
  /** Emoji avatar, or data:image/* (gallery photo) */
  avatar: string;
  /** Accent color for fallback initials */
  color: string;
  updatedAt: number;
};

/** Max data-URL length for gallery avatars (~localStorage-friendly) */
export const MAX_AVATAR_DATA_URL = 180_000;

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

/** Default display name from wallet — used when user has no profile yet */
export function defaultUsername(address: string): string {
  if (!address || address.length < 10) return "Player";
  return `Player_${address.slice(2, 6).toLowerCase()}`;
}

/**
 * Ensure a profile exists for this wallet (auto username if missing).
 * Call when staking / joining so create no longer needs a name field.
 */
export function ensureProfile(address: string): PlayerProfile {
  const existing = getProfile(address);
  if (existing && existing.username.length >= 2) return existing;
  return saveProfile(address, {
    username: existing?.username || defaultUsername(address),
    avatar: existing?.avatar || AVATAR_PRESETS[0],
    color: existing?.color || COLOR_PRESETS[0],
  });
}

export function isImageAvatar(avatar?: string | null): boolean {
  if (!avatar) return false;
  return (
    avatar.startsWith("data:image") ||
    avatar.startsWith("http://") ||
    avatar.startsWith("https://") ||
    avatar.startsWith("blob:")
  );
}

/**
 * Resize + compress a gallery image to a data URL safe for localStorage.
 */
export function compressImageToDataUrl(
  file: File,
  maxSize = 160,
  quality = 0.68
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("Please choose an image file"));
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      reject(new Error("Image is too large (max 12MB)"));
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        let { width, height } = img;
        const scale = Math.min(1, maxSize / Math.max(width, height));
        width = Math.max(1, Math.round(width * scale));
        height = Math.max(1, Math.round(height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Could not process image"));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        let dataUrl = canvas.toDataURL("image/jpeg", quality);
        // Step down quality if still huge
        let q = quality;
        while (dataUrl.length > MAX_AVATAR_DATA_URL && q > 0.35) {
          q -= 0.1;
          dataUrl = canvas.toDataURL("image/jpeg", q);
        }
        if (dataUrl.length > MAX_AVATAR_DATA_URL) {
          reject(new Error("Could not compress image enough — try a smaller photo"));
          return;
        }
        resolve(dataUrl);
      } catch (e) {
        reject(e instanceof Error ? e : new Error("Image processing failed"));
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not load that image"));
    };
    img.src = url;
  });
}
