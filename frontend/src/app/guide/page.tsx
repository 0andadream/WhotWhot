"use client";

import Link from "next/link";
import { SiteNav } from "@/components/SiteNav";
import { PlayGuide } from "@/components/PlayGuide";
import { FloatingWhotCards } from "@/components/landing/FloatingWhotCards";

export default function GuidePage() {
  return (
    <div className="landing-premium ds">
      <SiteNav />

      <FloatingWhotCards variant="page" />

      <main className="prem-main prem-main-over-float">
        <header className="prem-page-hero">
          <p className="prem-how-eyebrow">Play guide</p>
          <h1 className="prem-h1 prem-h1-page">The cards &amp; what they do</h1>
          <p className="prem-lede">
            Nigerian Whot in plain language, shapes, numbers, and every special
            card.
          </p>
          <div className="prem-hero-actions">
            <Link href="/play/ai" className="prem-btn-white">
              Practice vs AI
            </Link>
            <Link href="/play" className="prem-btn-ghost">
              Go to play
            </Link>
          </div>
        </header>

        <div className="prem-guide-body">
          <PlayGuide />
        </div>

        <div className="prem-guide-footer">
          <Link href="/play" className="prem-btn-white prem-btn-lg" aria-label="Play Whot">
            Play
          </Link>
        </div>
      </main>

      <footer className="prem-footer prem-main-over-float">
        © whotwhot · the card game, online. made by matt
      </footer>
    </div>
  );
}
