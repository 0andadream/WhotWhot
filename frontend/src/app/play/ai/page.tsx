"use client";

import Link from "next/link";
import { GameBoard } from "@/components/GameBoard";
import { SiteNav } from "@/components/SiteNav";
import { useMemo } from "react";

export default function PlayAiPage() {
  const seed = useMemo(
    () => `ai-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    []
  );

  return (
    <div className="landing-premium ds play-fit-page">
      <SiteNav />
      <div className="app-shell shell-wide play-fit-shell">
        <header className="header play-fit-header">
          <Link href="/play" className="btn btn-ghost btn-sm">
            ← Play
          </Link>
          <div className="pill">vs AI</div>
        </header>
        <GameBoard seed={seed} vsAi p1Name="You" p2Name="AI" showSoundToggle />
      </div>
    </div>
  );
}
