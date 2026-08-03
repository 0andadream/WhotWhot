"use client";

import type { PlayerProfile } from "@/lib/profile";

export function ProfileAvatar({
  profile,
  size = 36,
  className = "",
}: {
  profile?: Pick<PlayerProfile, "username" | "avatar" | "color"> | null;
  size?: number;
  className?: string;
}) {
  const letter = (profile?.username || "?").slice(0, 1).toUpperCase();
  const avatar = profile?.avatar || "";
  const isEmoji = avatar && !avatar.startsWith("#") && avatar.length <= 4;

  return (
    <span
      className={`profile-avatar ${className}`.trim()}
      style={{
        width: size,
        height: size,
        minWidth: size,
        minHeight: size,
        fontSize: isEmoji ? size * 0.52 : size * 0.4,
        background: isEmoji ? "rgba(255,255,255,0.08)" : profile?.color || "#c41e3a",
      }}
      title={profile?.username || "Player"}
      aria-hidden
    >
      {isEmoji ? avatar : letter}
    </span>
  );
}
