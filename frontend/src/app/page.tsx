"use client";

import Link from "next/link";
import { ConnectButton } from "@/components/ConnectButton";
import { WhotCard } from "@/components/WhotCard";
import type { Card } from "@/lib/whot/types";

const DEMO_CARDS: Card[] = [
  { id: "d1", shape: "circle", number: 1, special: "hold_on" },
  { id: "d2", shape: "star", number: 8, special: "suspension" },
  { id: "d3", shape: "whot", number: 20, special: "whot" },
  { id: "d4", shape: "cross", number: 5, special: "pick_three" },
  { id: "d5", shape: "square", number: 14, special: "general_market" },
];

/**
 * Marketing landing only — play lives on /play
 */
export default function HomePage() {
  return (
    <div className="page">
      <nav className="nav">
        <Link href="/" className="logo">
          <span>WhotWhot</span>
        </Link>
        <div className="links">
          <Link href="/play">Play</Link>
        </div>
        <div className="spacer" />
        <ConnectButton />
      </nav>

      <section className="hero">
        <div className="hero-inner">
          <div>
            <div className="eyebrow live">Live on Base</div>
            <div className="wordmark">WhotWhot</div>
            <div className="suit-band" aria-hidden>
              <span style={{ ["--c" as string]: "#b71c1c" }} />
              <span style={{ ["--c" as string]: "#b71c1c" }} />
              <span style={{ ["--c" as string]: "#b71c1c" }} />
              <span style={{ ["--c" as string]: "#b71c1c" }} />
              <span style={{ ["--c" as string]: "#b71c1c" }} />
            </div>
            <h1>
              Play Whot online,{" "}
              <span className="hl">stake tickets, winner takes both</span>
            </h1>
            <p className="lede">
              The card game Naija grew up with. Pick Two, Hold On, General Market.
              Now onchain with Megapot. Practice free or stake 1 ticket each and
              the winner walks with both.
            </p>
            <div className="ctas">
              <Link href="/play" className="btn btn-primary">
                Play
              </Link>
              <a href="#how" className="btn btn-ghost">
                How it works
              </a>
            </div>
          </div>

          <div className="hero-phone" aria-hidden>
            <div className="hero-phone-screen">
              <div className="pill" style={{ alignSelf: "center" }}>
                ● LIVE TABLE
              </div>
              <div style={{ display: "flex", justifyContent: "center", gap: 0 }}>
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} style={{ marginLeft: i ? -14 : 0 }}>
                    <WhotCard faceDown small />
                  </div>
                ))}
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  gap: 16,
                  margin: "8px 0",
                }}
              >
                <WhotCard faceDown small />
                <WhotCard card={DEMO_CARDS[2]} />
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  gap: 6,
                  flexWrap: "wrap",
                }}
              >
                {DEMO_CARDS.map((c) => (
                  <WhotCard key={c.id} card={c} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section" id="how">
        <div className="section-inner">
          <div className="eyebrow">How it works</div>
          <h2>From “Play” to your first hand, under a minute.</h2>
          <div className="steps">
            <div className="step">
              <div className="n">01</div>
              <h4>Tap Play</h4>
              <p>Practice vs AI instantly, no wallet required for the demo table.</p>
            </div>
            <div className="step">
              <div className="n">02</div>
              <h4>Pick your mode</h4>
              <p>Bots for practice, or stake one Megapot ticket each for real stakes.</p>
            </div>
            <div className="step">
              <div className="n">03</div>
              <h4>Winner takes both</h4>
              <p>Escrow locks tickets; dual confirms the winner and both NFTs transfer.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="section dark" id="megapot">
        <div className="section-inner">
          <div className="eyebrow">Megapot</div>
          <h2>Tickets as stakes</h2>
          <p className="sub">
            Each player locks 1 Megapot ticket NFT in escrow. When the Whot match
            ends and both confirm the winner, both tickets transfer to that wallet.
          </p>
          <Link href="/play" className="btn btn-primary btn-inline">
            Go to play
          </Link>
        </div>
      </section>

      <footer className="footer">
        © whotwhot · the card game, online. made by matt
      </footer>
    </div>
  );
}
