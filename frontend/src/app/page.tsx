"use client";

import Link from "next/link";
import { ConnectButton } from "@/components/ConnectButton";
import { BrandLogo } from "@/components/BrandLogo";
import { WhotCard } from "@/components/WhotCard";
import { ScrollReveal } from "@/components/ScrollReveal";
import type { Card } from "@/lib/whot/types";
import "./landing.css";

const FAN_CARDS: Card[] = [
  { id: "f1", shape: "star", number: 8, special: "suspension" },
  { id: "f2", shape: "circle", number: 1, special: "hold_on" },
  { id: "f3", shape: "whot", number: 20, special: "whot" },
  { id: "f4", shape: "cross", number: 5, special: "pick_three" },
  { id: "f5", shape: "square", number: 14, special: "general_market" },
];

/**
 * Marketing landing — visual redesign; copy + logo preserved.
 */
export default function HomePage() {
  return (
    <div className="landing">
      {/* ── Nav ── */}
      <nav className="landing-nav">
        <BrandLogo size={36} />
        <div className="nav-links">
          <Link href="/play">Play</Link>
          <Link href="/guide">Guide</Link>
        </div>
        <div className="nav-spacer" />
        <span className="base-pill" title="Network">
          Base
        </span>
        <ConnectButton />
      </nav>

      {/* ── Hero ── */}
      <section className="landing-hero">
        <div className="landing-hero-inner">
          <div>
            <div className="landing-eyebrow live">Live on Base</div>
            <div className="landing-wordmark">WhotWhot</div>
            <h1 className="landing-h1">
              Play Whot online,{" "}
              <span className="hl">stake tickets, winner takes both</span>
            </h1>
            <p className="landing-lede">
              The card game Naija grew up with. Pick Two, Hold On, General Market.
              Now onchain with Megapot. Practice free or stake 1 ticket each and
              the winner walks with both.
            </p>
            <div className="landing-ctas">
              <Link href="/play" className="landing-btn landing-btn-primary">
                Play
              </Link>
              <Link href="/guide" className="landing-btn landing-btn-ghost">
                Play guide
              </Link>
            </div>
            <div className="rule-chips">
              <span className="rule-chip">
                <strong>0</strong> wallet needed to practice
              </span>
              <span className="rule-chip">
                <strong>1</strong> ticket staked each
              </span>
              <span className="rule-chip">
                <strong>2</strong> confirms to settle
              </span>
            </div>
          </div>

          {/* Live table card fan */}
          <ScrollReveal className="live-table" as="div">
            <div className="live-table-head">
              <span className="live-badge">Live</span>
              <span className="live-table-id">TABLE · DEMO</span>
            </div>
            <div className="card-fan" aria-hidden>
              {FAN_CARDS.map((c) => (
                <div key={c.id} className="fan-card">
                  <WhotCard card={c} />
                </div>
              ))}
            </div>
            <p className="live-table-caption">
              Classic Whot faces — star, circle, cross, triangle, square &amp; WHOT
              20. Hover to spread the fan.
            </p>
          </ScrollReveal>
        </div>
      </section>

      {/* ── How it works ── */}
      <ScrollReveal as="section" className="landing-section cream">
        <div className="landing-section-inner" id="how">
          <div className="sec-eyebrow">How it works</div>
          <h2>From “Play” to your first hand, under a minute.</h2>
          <div className="how-steps">
            <div className="how-step">
              <div className="how-step-badge">
                <span className="how-step-num">01</span>
                <span className="how-step-pip c1" aria-hidden />
              </div>
              <h4>Tap Play</h4>
              <p>Practice vs AI instantly, no wallet required for the demo table.</p>
            </div>
            <div className="how-step">
              <div className="how-step-badge">
                <span className="how-step-num">02</span>
                <span className="how-step-pip c2" aria-hidden />
              </div>
              <h4>Pick your mode</h4>
              <p>
                Bots for practice, or stake one Megapot ticket each for real stakes.
              </p>
            </div>
            <div className="how-step">
              <div className="how-step-badge">
                <span className="how-step-num">03</span>
                <span className="how-step-pip c3" aria-hidden />
              </div>
              <h4>Winner takes both</h4>
              <p>
                Escrow locks tickets; dual confirms the winner and both NFTs
                transfer.
              </p>
            </div>
          </div>
        </div>
      </ScrollReveal>

      {/* ── Megapot trust ── */}
      <ScrollReveal as="section" className="landing-section surface">
        <div className="landing-section-inner" id="megapot">
          <div className="escrow-panel">
            <div className="sec-eyebrow">Megapot</div>
            <h2>Tickets as stakes</h2>
            <p className="sec-sub">
              Each player locks 1 Megapot ticket NFT in escrow. When the Whot match
              ends and both confirm the winner, both tickets transfer to that wallet.
            </p>

            <div className="escrow-flow">
              <div className="escrow-node">
                <div className="escrow-icon" aria-hidden>
                  <LockIcon />
                </div>
                <h4>Lock ticket</h4>
                <p>Each player stakes 1 Megapot ticket into escrow.</p>
              </div>
              <div className="escrow-arrow" aria-hidden>
                <span>→ →</span>
              </div>
              <div className="escrow-node">
                <div className="escrow-icon brick" aria-hidden>
                  <CardsIcon />
                </div>
                <h4>Match plays out</h4>
                <p>Classic Whot rules — first empty hand wins.</p>
              </div>
              <div className="escrow-arrow" aria-hidden>
                <span>→ →</span>
              </div>
              <div className="escrow-node">
                <div className="escrow-icon moss" aria-hidden>
                  <WinIcon />
                </div>
                <h4>Winner takes both</h4>
                <p>Both tickets transfer after dual confirm.</p>
              </div>
            </div>

            <div className="escrow-cta">
              <Link href="/play" className="landing-btn landing-btn-primary">
                Go to play
              </Link>
            </div>
          </div>
        </div>
      </ScrollReveal>

      <footer className="landing-footer">
        © whotwhot · the card game, online. made by matt
      </footer>
    </div>
  );
}

function LockIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function CardsIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="4" y="5" width="12" height="16" rx="2" />
      <path d="M10 3h8a2 2 0 0 1 2 2v14" />
    </svg>
  );
}

function WinIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z" />
      <path d="M7 9H5a3 3 0 0 0 3 3M17 9h2a3 3 0 0 1-3 3" />
    </svg>
  );
}
