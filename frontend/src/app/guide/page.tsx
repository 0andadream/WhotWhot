"use client";

import Link from "next/link";
import { ConnectButton } from "@/components/ConnectButton";
import { BrandLogo } from "@/components/BrandLogo";
import { PlayGuide } from "@/components/PlayGuide";

export default function GuidePage() {
  return (
    <div className="page">
      <nav className="nav">
        <BrandLogo size={36} />
        <div className="links">
          <Link href="/play">Play</Link>
          <Link href="/guide">Guide</Link>
        </div>
        <div className="spacer" />
        <ConnectButton />
      </nav>

      <main className="guide-page">
        <header className="guide-hero">
          <div className="eyebrow">Play guide</div>
          <h1 className="guide-title">The cards &amp; what they do</h1>
          <p className="guide-subtitle">
            Nigerian Whot in plain language — shapes, numbers, and every special card.
          </p>
          <div className="ctas" style={{ maxWidth: 360 }}>
            <Link href="/play/ai" className="btn btn-primary">
              Practice vs AI
            </Link>
            <Link href="/play" className="btn btn-ghost">
              Go to play
            </Link>
          </div>
        </header>

        <PlayGuide />

        <div className="guide-footer-cta">
          <Link href="/play" className="btn btn-primary btn-inline">
            Ready? Play
          </Link>
        </div>
      </main>

      <footer className="footer">
        © whotwhot · the card game, online. made by matt
      </footer>
    </div>
  );
}
