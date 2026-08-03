"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { SiteNav } from "@/components/SiteNav";
import { useAccount, useConnect, useWriteContract } from "wagmi";
import {
  useCountdown,
  useJackpotInfo,
  useBuyRandomTicket,
} from "@/hooks/useMegapot";
import { useUserTickets } from "@/hooks/useUserTickets";
import {
  useEscrowReady,
  useMyMatches,
  statusLabel,
  MatchStatus,
} from "@/hooks/useEscrow";
import { ADDRESSES, erc20Abi, randomBuyerAbi } from "@/lib/contracts";
import { stringToHex, parseUnits } from "viem";

function isMobile() {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

export default function PlayLobbyPage() {
  const { isConnected, address } = useAccount();
  const { connect, connectors, isPending: connectPending } = useConnect();
  const jackpot = useJackpotInfo();
  const { stakeableCount, refetch: refetchTickets } = useUserTickets();
  const countdown = useCountdown(jackpot.drawingTime);
  const [tick, setTick] = useState(0);
  const escrowReady = useEscrowReady();
  const {
    matches: myMatches,
    pastMatches,
    loading: myLoading,
    refetch: refetchMine,
  } = useMyMatches();
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
      setStatusMsg("Ticket purchased! You can stake it in a few seconds.");
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
      setStatusMsg("Confirming purchase in your wallet…");
    } catch (e: unknown) {
      setBuyStep("idle");
      setStatusMsg(e instanceof Error ? e.message : "Purchase failed");
    }
  };

  const needsTicket = isConnected && stakeableCount === 0;

  const onConnectWallet = () => {
    const hasInjected =
      typeof window !== "undefined" &&
      typeof (window as Window & { ethereum?: unknown }).ethereum !==
        "undefined";
    if (isMobile() && !hasInjected) {
      window.location.href = `https://metamask.app.link/dapp/${window.location.host}${window.location.pathname}`;
      return;
    }
    const primary =
      connectors.find((c) => c.type === "injected") || connectors[0];
    if (primary) {
      connect({ connector: primary });
    } else {
      setStatusMsg("Install MetaMask or open this site in a wallet browser.");
    }
  };

  const onBuyOrConnect = () => {
    if (!isConnected) {
      onConnectWallet();
      return;
    }
    void onBuyTicket();
  };

  return (
    <div className="landing-premium ds">
      <SiteNav />
      <main className="prem-main">
        <header className="prem-page-hero">
          <p className="prem-how-eyebrow">Play</p>
          <h1 className="prem-h1 prem-h1-page">Play Whot</h1>
          <p className="prem-lede">
            Practice free, or stake one Megapot ticket each. Winner takes both.
          </p>
        </header>

        <section className="prem-panel">
          <div className="prem-stats-grid">
            <div>
              <div className="prem-stat-label">Jackpot</div>
              <div className="prem-stat-value">
                {jackpot.prizePoolUsd ?? "…"}
              </div>
            </div>
            <div>
              <div className="prem-stat-label">Next draw</div>
              <div className="prem-stat-value prem-stat-sm">{countdown}</div>
            </div>
            <div>
              <div className="prem-stat-label">Your tickets</div>
              <div className="prem-stat-value">
                {isConnected ? stakeableCount : "—"}
                <span className="prem-stat-unit"> open-draw</span>
              </div>
            </div>
          </div>
          <div className="prem-panel-footer">
            <p className="prem-panel-hint">
              {!isConnected
                ? "Connect your wallet to buy a Megapot ticket and stake."
                : needsTicket
                  ? "Buy a ticket for this Megapot round, then create or join a table."
                  : "Only tickets for the current round can be staked."}
            </p>
            <button
              type="button"
              className="prem-btn-white"
              disabled={
                connectPending ||
                (isConnected && buyStep !== "idle")
              }
              onClick={onBuyOrConnect}
            >
              {!isConnected
                ? connectPending
                  ? "Connecting…"
                  : "Connect to buy"
                : buyStep === "approve"
                  ? "Approve USDC…"
                  : buyStep === "buy"
                    ? "Buying…"
                    : `Buy ticket · ${jackpot.ticketPriceUsd ?? "$1"}`}
            </button>
          </div>
          {statusMsg && (
            <div className="alert" style={{ marginTop: 14 }}>
              {statusMsg}
            </div>
          )}
          {error && (
            <div className="alert" style={{ marginTop: 14 }}>
              {error.message}
            </div>
          )}
        </section>

        <section className="prem-section">
          <h2 className="prem-section-title">Start a game</h2>
          <div className="prem-mode-grid">
            <Link href="/play/ai" className="prem-mode-card">
              <span className="prem-mode-tag free">Free</span>
              <h3>Practice vs AI</h3>
              <p>Learn the rules. No wallet, no tickets.</p>
              <span className="prem-btn-white sm prem-mode-btn">Play free</span>
            </Link>
            <Link
              href={escrowReady ? "/play/create" : "#"}
              className="prem-mode-card"
              style={
                !escrowReady
                  ? { opacity: 0.5, pointerEvents: "none" }
                  : undefined
              }
            >
              <span className="prem-mode-tag stake">Stake</span>
              <h3>Create a table</h3>
              <p>Lock 1 ticket. Share the table with a friend.</p>
              <span className="prem-btn-white sm prem-mode-btn">Create</span>
            </Link>
            <Link
              href={escrowReady ? "/play/join" : "#"}
              className="prem-mode-card"
              style={
                !escrowReady
                  ? { opacity: 0.5, pointerEvents: "none" }
                  : undefined
              }
            >
              <span className="prem-mode-tag stake">Stake</span>
              <h3>Join a table</h3>
              <p>Enter the table number your host shared.</p>
              <span className="prem-btn-white sm prem-mode-btn">Join</span>
            </Link>
          </div>
        </section>

        <section className="prem-section">
          <div className="prem-section-head">
            <h2 className="prem-section-title" style={{ margin: 0 }}>
              Your tables
            </h2>
            <button
              type="button"
              className="prem-btn-ghost"
              onClick={() => void refetchMine()}
            >
              Refresh
            </button>
          </div>
          <p className="prem-section-hint">
            Live games only. Finished ones move to Past.
          </p>

          {!isConnected && (
            <div className="prem-panel prem-empty">
              <p>Connect your wallet to see tables you host or joined.</p>
            </div>
          )}
          {isConnected && myLoading && (
            <p className="prem-section-hint">Loading your tables…</p>
          )}
          {isConnected && !myLoading && myMatches.length === 0 && (
            <div className="prem-panel prem-empty">
              <p>No live tables yet. Create one or join with a table ID.</p>
            </div>
          )}

          <div className="prem-table-list">
            {myMatches.map((m) => {
              const boardHref =
                m.status === MatchStatus.Waiting && m.role === "guest"
                  ? `/play/join?matchId=${m.id}`
                  : `/play/match/${m.id.toString()}`;
              const ticketsHref = `/play/match/${m.id.toString()}/tickets`;
              return (
                <div key={String(m.id)} className="prem-table-card">
                  <div>
                    <div className="prem-table-title">
                      Table #{m.id.toString()}
                    </div>
                    <p className="prem-table-meta">
                      {m.role === "host" ? "You host" : "You joined"}
                      {" · "}
                      {m.status === MatchStatus.Active
                        ? "In progress"
                        : m.status === MatchStatus.Waiting
                          ? "Waiting for opponent"
                          : statusLabel(m.status)}
                    </p>
                  </div>
                  <div className="prem-table-actions">
                    <Link href={boardHref} className="prem-btn-white sm">
                      {m.status === MatchStatus.Waiting && m.role === "guest"
                        ? "Join"
                        : "Open board"}
                    </Link>
                    {(m.ticket1 > 0n || m.ticket2 > 0n) && (
                      <Link href={ticketsHref} className="prem-btn-ghost">
                        Tickets
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {isConnected && pastMatches.length > 0 && (
          <section className="prem-section">
            <h2 className="prem-section-title">Past</h2>
            <p className="prem-section-hint">
              Finished or cancelled. Check tickets if you need results or claims.
            </p>
            <div className="prem-table-list">
              {pastMatches.map((m) => {
                const ticketsHref = `/play/match/${m.id.toString()}/tickets`;
                return (
                  <div
                    key={`past-${String(m.id)}`}
                    className="prem-table-card past"
                  >
                    <div>
                      <div className="prem-table-title">
                        Table #{m.id.toString()}
                      </div>
                      <p className="prem-table-meta">
                        {m.status === MatchStatus.Resolved
                          ? "Finished"
                          : m.status === MatchStatus.Cancelled
                            ? "Cancelled"
                            : statusLabel(m.status)}
                      </p>
                    </div>
                    {(m.ticket1 > 0n || m.ticket2 > 0n) && (
                      <Link href={ticketsHref} className="prem-btn-ghost">
                        Tickets &amp; results
                      </Link>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </main>

      <footer className="prem-footer">
        © whotwhot · the card game, online. made by matt
      </footer>
    </div>
  );
}
