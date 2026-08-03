"use client";

import Link from "next/link";
import { GameBoard } from "@/components/GameBoard";
import { useMemo } from "react";

export default function PlayAiPage() {
  const seed = useMemo(
    () => `ai-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    []
  );

  return (
    <div className="app-shell shell-wide">
      <header className="header">
        <Link href="/" className="btn btn-ghost btn-sm connect-btn">
          ← Lobby
        </Link>
        <div className="pill">Practice · vs AI</div>
      </header>
      <GameBoard seed={seed} vsAi p1Name="You" p2Name="AI" />
    </div>
  );
}
