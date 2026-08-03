"use client";

import type { PlayerProfile } from "@/lib/profile";
import { isImageAvatar } from "@/lib/profile";

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
  const isPhoto = isImageAvatar(avatar);
  const isEmoji =
    !isPhoto && avatar && !avatar.startsWith("#") && avatar.length <= 4;

  if (isPhoto) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatar}
        alt=""
        className={`profile-avatar profile-avatar-photo ${className}`.trim()}
        width={size}
        height={size}
        style={{
          width: size,
          height: size,
          minWidth: size,
          minHeight: size,
          objectFit: "cover",
        }}
        title={profile?.username || "Player"}
        aria-hidden
      />
    );
  }

  return (
    <span
      className={`profile-avatar ${className}`.trim()}
      style={{
        width: size,
        height: size,
        minWidth: size,
        minHeight: size,
        fontSize: isEmoji ? size * 0.52 : size * 0.4,
        background: isEmoji
          ? "rgba(255,255,255,0.08)"
          : profile?.color || "#c41e3a",
      }}
      title={profile?.username || "Player"}
      aria-hidden
    >
      {isEmoji ? avatar : letter}
    </span>
  );
}
