"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ConnectButton } from "@/components/ConnectButton";
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

type Tab = "modes" | "tables" | "rules";

export default function PlayLobbyPage() {
  const { isConnected, address } = useAccount();
  const jackpot = useJackpotInfo();
  const { count, refetch: refetchTickets } = useTicketCount();
  const countdown = useCountdown(jackpot.drawingTime);
  const [tick, setTick] = useState(0);
  const [tab, setTab] = useState<Tab>("modes");
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
    <div className="app-shell">
      <header className="header">
        <Link href="/" className="logo-row" style={{ textDecoration: "none" }}>
          <div className="logo-mark">W</div>
          <div>
            <h1>Play</h1>
            <p>WhotWhot · Base</p>
          </div>
        </Link>
        <ConnectButton />
      </header>

      <section className="stat-row">
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
        {(["modes", "tables", "rules"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            className={tab === t ? "active" : ""}
            onClick={() => setTab(t)}
          >
            {t === "modes" ? "Modes" : t === "tables" ? "Tables" : "Rules"}
          </button>
        ))}
      </div>

      {tab === "modes" && (
        <div className="mode-grid">
          <Link href="/play/ai" className="mode-card">
            <h3>Practice vs AI</h3>
            <p>Full Nigerian rules. No tickets. Perfect on phone or desktop.</p>
            <span className="btn btn-primary btn-sm">Play now</span>
          </Link>
          <Link
            href={escrowReady ? "/play/create" : "#"}
            className="mode-card"
            style={
              !escrowReady ? { opacity: 0.55, pointerEvents: "none" } : undefined
            }
          >
            <h3>Stake and play</h3>
            <p>Each locks 1 Megapot ticket. Winner receives both NFTs.</p>
            <span className="btn btn-secondary btn-sm">Create table</span>
          </Link>
          <Link
            href={escrowReady ? "/play/join" : "#"}
            className="mode-card"
            style={
              !escrowReady ? { opacity: 0.55, pointerEvents: "none" } : undefined
            }
          >
            <h3>Join a table</h3>
            <p>Enter match ID or open from the lobby list.</p>
            <span className="btn btn-ghost btn-sm">Join</span>
          </Link>
        </div>
      )}

      {tab === "tables" && (
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

      {tab === "rules" && (
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

      <Link href="/" className="btn btn-ghost">
        Back to home
      </Link>
    </div>
  );
}
