"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ConnectButton } from "@/components/ConnectButton";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import {
  useBuyRandomTicket,
  useCountdown,
  useJackpotInfo,
  useTicketCount,
} from "@/hooks/useMegapot";
import { useEscrowReady, useOpenMatches } from "@/hooks/useEscrow";
import { ADDRESSES, erc20Abi } from "@/lib/contracts";
import { stringToHex, parseUnits } from "viem";

type Tab = "play" | "tickets" | "lobby";

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

  // Refresh countdown every second
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);
  void tick;

  useEffect(() => {
    if (isSuccess) {
      setStatusMsg("Ticket purchased! Balance will update shortly.");
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
      const { randomBuyerAbi } = await import("@/lib/contracts");
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
        <div className="logo">
          <div className="logo-mark">WW</div>
          <div>
            <h1>WhotWhot</h1>
            <p>Onchain Whot × Megapot · Base</p>
          </div>
        </div>
        <ConnectButton />
      </header>

      <section className="stat-row">
        <div className="stat">
          <div className="label">Megapot Jackpot</div>
          <div className="value">{jackpot.prizePoolUsd ?? "…"}</div>
        </div>
        <div className="stat">
          <div className="label">Next draw</div>
          <div className="value" style={{ fontSize: "1.05rem" }}>
            {countdown}
          </div>
        </div>
      </section>

      <div className="ticket-badge">
        <div>
          <div className="label muted">Your Megapot tickets</div>
          <strong>{isConnected ? (count ?? "…") : "—"}</strong>
          <span className="muted"> tickets</span>
        </div>
        <button
          type="button"
          className="btn btn-gold"
          style={{ width: "auto", padding: "12px 16px" }}
          disabled={!isConnected || buyStep !== "idle"}
          onClick={onBuyTicket}
        >
          {buyStep === "approve"
            ? "Approve USDC…"
            : buyStep === "buy"
              ? "Buying…"
              : `Buy 1 · ${jackpot.ticketPriceUsd ?? "$1"}`}
        </button>
      </div>
      {statusMsg && <div className="alert">{statusMsg}</div>}
      {error && <div className="alert">{error.message}</div>}

      <div className="tabs">
        {(["play", "lobby", "tickets"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            className={tab === t ? "active" : ""}
            onClick={() => setTab(t)}
          >
            {t === "play" ? "Play" : t === "lobby" ? "Lobby" : "How it works"}
          </button>
        ))}
      </div>

      {tab === "play" && (
        <div className="stack">
          <div className="card-panel">
            <h2>Practice vs AI</h2>
            <p className="muted">
              Full Nigerian Whot rules. No tickets required — perfect for demos.
            </p>
            <Link href="/play/ai" className="btn btn-primary" style={{ marginTop: 10 }}>
              Play vs AI
            </Link>
          </div>

          <div className="card-panel">
            <h2>Stake & play (2-player)</h2>
            <p className="muted">
              Each player stakes <strong>1 Megapot ticket</strong>. Winner receives{" "}
              <strong>both ticket NFTs</strong>.
            </p>
            {!escrowReady && (
              <div className="alert" style={{ marginTop: 10 }}>
                Escrow not deployed yet. Set{" "}
                <code>NEXT_PUBLIC_WHOT_ESCROW_ADDRESS</code> after deploy.
              </div>
            )}
            <div className="stack" style={{ marginTop: 10 }}>
              <Link
                href="/play/create"
                className={`btn btn-secondary ${!escrowReady ? "disabled" : ""}`}
                style={!escrowReady ? { pointerEvents: "none", opacity: 0.5 } : undefined}
              >
                Create match (stake ticket)
              </Link>
              <Link
                href="/play/join"
                className="btn btn-ghost"
                style={!escrowReady ? { pointerEvents: "none", opacity: 0.5 } : undefined}
              >
                Join match
              </Link>
            </div>
          </div>
        </div>
      )}

      {tab === "lobby" && (
        <div className="card-panel">
          <h2>Open matches</h2>
          {!escrowReady && (
            <p className="muted">Deploy WhotMatchEscrow to list open games.</p>
          )}
          {escrowReady && matchIds.length === 0 && (
            <p className="muted">No open matches. Create one!</p>
          )}
          <div className="stack">
            {matchIds.map((id) => (
              <Link
                key={String(id)}
                href={`/play/join?matchId=${id}`}
                className="btn btn-ghost"
              >
                Match #{id.toString()}
              </Link>
            ))}
          </div>
        </div>
      )}

      {tab === "tickets" && (
        <div className="card-panel stack">
          <h2>How WhotWhot works</h2>
          <p className="muted">
            <strong>1.</strong> Buy a $1 Megapot ticket (or use one you already own).
            Ticket count is shown above — no NFT gallery.
          </p>
          <p className="muted">
            <strong>2.</strong> Create or join a 2-player match. Each side locks one
            ticket in the escrow contract.
          </p>
          <p className="muted">
            <strong>3.</strong> Play Nigerian Whot: match shape or number. Specials:
            1 Hold On · 2 Pick Two · 5 Pick Three · 8 Suspension · 14 General Market
            · 20 Whot (wild).
          </p>
          <p className="muted">
            <strong>4.</strong> First to empty their hand wins. Both players submit
            the winner on-chain → <strong>both tickets transfer to the winner</strong>.
          </p>
          <p className="muted">
            Built for the <strong>Inco × Megapot Summer Game Jam</strong> on Base.
          </p>
        </div>
      )}

      <footer className="muted" style={{ textAlign: "center", marginTop: 8 }}>
        Contracts · Base · Megapot tickets as stakes
      </footer>
    </div>
  );
}
