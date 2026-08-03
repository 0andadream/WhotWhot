"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ConnectButton } from "@/components/ConnectButton";
import { WhotCard } from "@/components/WhotCard";
import { useAccount, useWriteContract } from "wagmi";
import {
  useCountdown,
  useJackpotInfo,
  useTicketCount,
  useBuyRandomTicket,
} from "@/hooks/useMegapot";
import { useEscrowReady, useOpenMatches } from "@/hooks/useEscrow";
import { ADDRESSES, erc20Abi, randomBuyerAbi } from "@/lib/contracts";
import { stringToHex, parseUnits } from "viem";
import type { Card } from "@/lib/whot/types";

type Tab = "play" | "lobby" | "about";

const DEMO_CARDS: Card[] = [
  { id: "d1", shape: "circle", number: 1, special: "hold_on" },
  { id: "d2", shape: "star", number: 8, special: "suspension" },
  { id: "d3", shape: "whot", number: 20, special: "whot" },
  { id: "d4", shape: "cross", number: 5, special: "pick_three" },
  { id: "d5", shape: "square", number: 14, special: "general_market" },
];

export default function HomePage() {
  const { isConnected, address } = useAccount();
  const jackpot = useJackpotInfo();
  const { count, refetch: refetchTickets } = useTicketCount();
  const countdown = useCountdown(jackpot.drawingTime);
  const [tick, setTick] = useState(0);
  const [tab, setTab] = useState<Tab>("play");
  const escrowReady = useEscrowReady();
  const { matchIds } = useOpenMatches();
  const { isSuccess, error } = useBuyRandomTicket();
  const { writeContractAsync } = useWriteContract();
  const [buyStep, setBuyStep] = useState<"idle" | "approve" | "buy">("idle");
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);
  void tick;

  useEffect(() => {
    if (isSuccess) {
      setStatusMsg("Ticket purchased! Balance updates shortly.");
      setBuyStep("idle");
      setTimeout(() => refetchTickets(), 4000);
    }
  }, [isSuccess, refetchTickets]);

  const onBuyTicket = async () => {
    if (!address || !jackpot.ticketPriceRaw) return;
    try {
      setStatusMsg(null);
      setBuyStep("approve");
      await writeContractAsync({
        address: ADDRESSES.usdc,
        abi: erc20Abi,
        functionName: "approve",
        args: [ADDRESSES.jackpotRandomTicketBuyer, jackpot.ticketPriceRaw],
        chainId: 8453,
      });
      setBuyStep("buy");
      const referrer = (process.env.NEXT_PUBLIC_REFERRER_ADDRESS ||
        "0x0000000000000000000000000000000000000000") as `0x${string}`;
      const source = stringToHex(
        process.env.NEXT_PUBLIC_SOURCE_TAG || "whotwhot",
        { size: 32 }
      );
      const hasReferrer =
        referrer !== "0x0000000000000000000000000000000000000000";
      await writeContractAsync({
        address: ADDRESSES.jackpotRandomTicketBuyer,
        abi: randomBuyerAbi,
        functionName: "buyTickets",
        args: [
          1n,
          address,
          hasReferrer ? [referrer] : [],
          hasReferrer ? [parseUnits("1", 18)] : [],
          source,
        ],
        chainId: 8453,
      });
      setStatusMsg("Confirming ticket purchase…");
    } catch (e: unknown) {
      setBuyStep("idle");
      setStatusMsg(e instanceof Error ? e.message : "Purchase failed");
    }
  };

  return (
    <div className="page">
      <nav className="nav">
        <div className="logo">
          <span>WhotWhot</span>
        </div>
        <div className="links">
          <a href="#play">Play</a>
          <a href="#how">How it works</a>
          <a href="#megapot">Megapot</a>
        </div>
        <div className="spacer" />
        <ConnectButton />
      </nav>

      {/* Hero — PlayWhot style */}
      <section className="hero">
        <div className="hero-inner">
          <div>
            <div className="eyebrow live">Live on Base · free to try</div>
            <div className="wordmark">WhotWhot</div>
            <div className="suit-band" aria-hidden>
              <span style={{ ["--c" as string]: "#c41e3a" }} />
              <span style={{ ["--c" as string]: "#1e5bb8" }} />
              <span style={{ ["--c" as string]: "#1b7a3d" }} />
              <span style={{ ["--c" as string]: "#6b2d8b" }} />
              <span style={{ ["--c" as string]: "#d97706" }} />
            </div>
            <h1>
              Play Whot online —{" "}
              <span className="hl">stake tickets, winner takes both</span>
            </h1>
            <p className="lede">
              The card game Naija grew up with. Pick Two, Hold On, General Market
              — now onchain with Megapot. Practice free, or stake 1 ticket each
              and the winner walks with both NFTs.
            </p>
            <div className="ctas" id="play">
              <Link href="/play/ai" className="btn btn-primary">
                Play vs AI
              </Link>
              <Link href="/play/create" className="btn btn-ghost">
                Stake match
              </Link>
            </div>
            <p className="muted" style={{ marginTop: 16 }}>
              Web · mobile browser · no install · Base network
            </p>
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

      {/* App lobby */}
      <div className="app-shell" style={{ maxWidth: 560, paddingTop: 0 }}>
        <section className="stat-row" id="megapot">
          <div className="stat">
            <div className="label">Megapot jackpot</div>
            <div className="value">{jackpot.prizePoolUsd ?? "…"}</div>
          </div>
          <div className="stat">
            <div className="label">Next draw</div>
            <div className="value" style={{ fontSize: "1rem" }}>
              {countdown}
            </div>
          </div>
        </section>

        <div className="ticket-badge">
          <div>
            <div className="muted" style={{ fontSize: "0.75rem" }}>
              Your Megapot tickets
            </div>
            <strong>{isConnected ? (count ?? "…") : "—"}</strong>
            <span className="muted"> tickets</span>
          </div>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={!isConnected || buyStep !== "idle"}
            onClick={onBuyTicket}
          >
            {buyStep === "approve"
              ? "Approve…"
              : buyStep === "buy"
                ? "Buying…"
                : `Buy 1 · ${jackpot.ticketPriceUsd ?? "$1"}`}
          </button>
        </div>
        {statusMsg && <div className="alert">{statusMsg}</div>}
        {error && <div className="alert">{error.message}</div>}

        <div className="tabs">
          {(["play", "lobby", "about"] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              className={tab === t ? "active" : ""}
              onClick={() => setTab(t)}
            >
              {t === "play" ? "Play" : t === "lobby" ? "Tables" : "Rules"}
            </button>
          ))}
        </div>

        {tab === "play" && (
          <div className="mode-grid">
            <Link href="/play/ai" className="mode-card">
              <div className="icon">🤖</div>
              <h3>Practice vs AI</h3>
              <p>Full Nigerian rules. No tickets. Perfect on phone or desktop.</p>
              <span className="btn btn-primary btn-sm">Play now</span>
            </Link>
            <Link
              href={escrowReady ? "/play/create" : "#"}
              className="mode-card"
              style={!escrowReady ? { opacity: 0.55, pointerEvents: "none" } : undefined}
            >
              <div className="icon">🎟️</div>
              <h3>Stake & play</h3>
              <p>Each locks 1 Megapot ticket. Winner receives both NFTs.</p>
              <span className="btn btn-secondary btn-sm">Create table</span>
            </Link>
            <Link
              href={escrowReady ? "/play/join" : "#"}
              className="mode-card"
              style={!escrowReady ? { opacity: 0.55, pointerEvents: "none" } : undefined}
            >
              <div className="icon">🔗</div>
              <h3>Join a table</h3>
              <p>Enter match ID or open from the lobby list.</p>
              <span className="btn btn-ghost btn-sm">Join</span>
            </Link>
          </div>
        )}

        {tab === "lobby" && (
          <div className="card-panel stack">
            <h2>Open tables</h2>
            {!escrowReady && (
              <p className="muted">Escrow address missing — stake modes offline.</p>
            )}
            {escrowReady && matchIds.length === 0 && (
              <p className="muted">No open matches. Create one and share the ID.</p>
            )}
            {matchIds.map((id) => (
              <Link
                key={String(id)}
                href={`/play/join?matchId=${id}`}
                className="btn btn-ghost"
              >
                Table #{id.toString()}
              </Link>
            ))}
          </div>
        )}

        {tab === "about" && (
          <div className="card-panel stack">
            <h2>How to play</h2>
            <p className="muted">
              Match the top card by <strong>shape</strong> (Circle, Triangle, Cross,
              Square, Star) or <strong>number</strong>. First to empty their hand wins.
            </p>
            <p className="muted">
              <strong>1</strong> Hold On · <strong>2</strong> Pick Two ·{" "}
              <strong>5</strong> Pick Three · <strong>8</strong> Suspension ·{" "}
              <strong>14</strong> General Market · <strong>20</strong> Whot (wild)
            </p>
            <p className="muted">
              Legal cards glow gold. On mobile, swipe your hand and tap big cards.
            </p>
          </div>
        )}
      </div>

      <section className="section" id="how">
        <div className="section-inner">
          <div className="eyebrow">How it works</div>
          <h2>From “Play” to your first hand — under a minute.</h2>
          <p className="sub">
            No app store wait. Open the site on your phone or laptop and deal.
          </p>
          <div className="steps">
            <div className="step">
              <div className="n">01</div>
              <h4>Tap Play</h4>
              <p>Practice vs AI instantly — no wallet required for the demo table.</p>
            </div>
            <div className="step">
              <div className="n">02</div>
              <h4>Pick your mode</h4>
              <p>Bots for practice, or stake one Megapot ticket each for real stakes.</p>
            </div>
            <div className="step">
              <div className="n">03</div>
              <h4>Winner takes both</h4>
              <p>Escrow locks tickets; dual-confirm the winner and both NFTs transfer.</p>
            </div>
          </div>
        </div>
      </section>

      <footer className="footer">
        WhotWhot · Inco × Megapot Game Jam · Base
        <br />
        <span style={{ opacity: 0.7 }}>
          UI inspired by the look of modern online Whot — original onchain stakes.
        </span>
      </footer>
    </div>
  );
}
