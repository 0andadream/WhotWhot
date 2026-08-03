"use client";

import Link from "next/link";
import { SiteNav } from "@/components/SiteNav";
import { PlayGuide } from "@/components/PlayGuide";

export default function GuidePage() {
  return (
    <div className="ds">
      <SiteNav />

      <main className="guide-page">
        <header className="guide-hero">
          <div className="eyebrow" style={{ color: "var(--muted)" }}>
            Play guide
          </div>
          <h1 className="guide-title">The cards &amp; what they do</h1>
          <p className="guide-subtitle">
            Nigerian Whot in plain language — shapes, numbers, and every special card.
          </p>
          <div className="ctas" style={{ maxWidth: 360, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link href="/play/ai" className="btn btn-primary">
              Practice vs AI
            </Link>
            <Link href="/play" className="btn btn-ghost">
              Go to play
            </Link>
          </div>
        </header>

        <PlayGuide />

        <div className="guide-footer-cta" style={{ marginTop: 36, display: "flex", justifyContent: "center" }}>
          <Link href="/play" className="btn btn-primary btn-inline">
            Ready? Play
          </Link>
        </div>
      </main>

      <footer className="landing-footer">
        © whotwhot · the card game, online. made by matt
      </footer>
    </div>
  );
}
