"use client";

import { GameBoard } from "@/components/GameBoard";
import { useMemo } from "react";
import { getProfile } from "@/lib/profile";
import { useAccount } from "wagmi";

export default function PlayAiPage() {
  const seed = useMemo(
    () => `ai-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    []
  );
  const { address } = useAccount();
  const profile = address ? getProfile(address) : null;

  return (
    <GameBoard
      seed={seed}
      vsAi
      p1Name={profile?.username || "You"}
      p2Name="AI"
      showSoundToggle
      stakeTickets={0}
      potTickets={0}
      ticketBalance="Practice"
      meProfile={
        profile
          ? {
              username: profile.username,
              avatar: profile.avatar,
              color: profile.color,
            }
          : { username: "You", avatar: "🃏", color: "#c41e3a" }
      }
      oppProfile={{ username: "AI", avatar: "🤖", color: "#3b82f6" }}
      backHref="/play"
    />
  );
}
