"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { SiteNav } from "@/components/SiteNav";
import { useAccount, useWriteContract } from "wagmi";
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

export default function PlayLobbyPage() {
  const { isConnected, address } = useAccount();
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

  return (
    <div className="ds">
      <SiteNav />
      <div className="app-shell shell-wide play-lobby">
        <header className="play-hero">
          <p className="play-kicker">WhotWhot · Base</p>
          <h1>Play Whot</h1>
          <p className="play-lead">
            Practice free, or stake one Megapot ticket each. Winner takes both.
          </p>
        </header>

        <section className="play-jackpot card-panel">
          <div className="play-jackpot-grid">
            <div>
              <div className="label">Jackpot</div>
              <div className="play-jackpot-value">
                {jackpot.prizePoolUsd ?? "…"}
              </div>
            </div>
            <div>
              <div className="label">Next draw</div>
              <div className="play-jackpot-value play-jackpot-countdown">
                {countdown}
              </div>
            </div>
            <div>
              <div className="label">Your stake tickets</div>
              <div className="play-jackpot-value">
                {isConnected ? stakeableCount : "—"}
                <span className="muted" style={{ fontSize: "0.85rem", fontWeight: 500 }}>
                  {" "}
                  open-draw
                </span>
              </div>
            </div>
          </div>
          <div className="play-buy-row">
            <p className="muted" style={{ fontSize: "0.85rem", margin: 0, flex: 1 }}>
              {needsTicket
                ? "Buy a ticket for this Megapot round, then create or join a table."
                : "Only tickets for the current round can be staked."}
            </p>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!isConnected || buyStep !== "idle"}
              onClick={() => void onBuyTicket()}
            >
              {!isConnected
                ? "Connect to buy"
                : buyStep === "approve"
                  ? "Approve USDC…"
                  : buyStep === "buy"
                    ? "Buying…"
                    : `Buy ticket · ${jackpot.ticketPriceUsd ?? "$1"}`}
            </button>
          </div>
          {statusMsg && <div className="alert" style={{ marginTop: 12 }}>{statusMsg}</div>}
          {error && (
            <div className="alert" style={{ marginTop: 12 }}>
              {error.message}
            </div>
          )}
        </section>

        <section className="play-section">
          <h2 className="play-section-title">Start a game</h2>
          <div className="mode-grid play-mode-grid">
            <Link href="/play/ai" className="mode-card play-mode-card">
              <span className="play-mode-tag">Free</span>
              <h3>Practice vs AI</h3>
              <p>Learn the rules. No wallet, no tickets.</p>
              <span className="btn btn-primary btn-sm">Play free</span>
            </Link>
            <Link
              href={escrowReady ? "/play/create" : "#"}
              className="mode-card play-mode-card"
              style={
                !escrowReady
                  ? { opacity: 0.55, pointerEvents: "none" }
                  : undefined
              }
            >
              <span className="play-mode-tag stake">Stake</span>
              <h3>Create a table</h3>
              <p>Lock 1 ticket. Share the table with a friend.</p>
              <span className="btn btn-secondary btn-sm">Create</span>
            </Link>
            <Link
              href={escrowReady ? "/play/join" : "#"}
              className="mode-card play-mode-card"
              style={
                !escrowReady
                  ? { opacity: 0.55, pointerEvents: "none" }
                  : undefined
              }
            >
              <span className="play-mode-tag stake">Stake</span>
              <h3>Join a table</h3>
              <p>Enter the table number your host shared.</p>
              <span className="btn btn-ghost btn-sm">Join</span>
            </Link>
          </div>
        </section>

        <section className="play-section">
          <div className="play-section-head">
            <h2 className="play-section-title" style={{ margin: 0 }}>
              Your tables
            </h2>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => void refetchMine()}
            >
              Refresh
            </button>
          </div>
          <p className="muted play-section-hint">
            Live games only. Finished ones move to Past.
          </p>

          {!isConnected && (
            <div className="card-panel play-empty">
              <p className="muted" style={{ margin: 0 }}>
                Connect your wallet to see tables you host or joined.
              </p>
            </div>
          )}
          {isConnected && myLoading && (
            <p className="muted">Loading your tables…</p>
          )}
          {isConnected && !myLoading && myMatches.length === 0 && (
            <div className="card-panel play-empty">
              <p className="muted" style={{ margin: 0 }}>
                No live tables yet. Create one or join with a table ID.
              </p>
            </div>
          )}

          <div className="play-table-list">
            {myMatches.map((m) => {
              const boardHref =
                m.status === MatchStatus.Waiting && m.role === "guest"
                  ? `/play/join?matchId=${m.id}`
                  : `/play/match/${m.id.toString()}`;
              const ticketsHref = `/play/match/${m.id.toString()}/tickets`;
              return (
                <div key={String(m.id)} className="play-table-card">
                  <div className="play-table-info">
                    <div className="play-table-title">
                      Table #{m.id.toString()}
                    </div>
                    <p className="muted play-table-meta">
                      {m.role === "host" ? "You host" : "You joined"}
                      {" · "}
                      {m.status === MatchStatus.Active
                        ? "In progress"
                        : m.status === MatchStatus.Waiting
                          ? "Waiting for opponent"
                          : statusLabel(m.status)}
                    </p>
                  </div>
                  <div className="play-table-actions">
                    <Link href={boardHref} className="btn btn-primary btn-sm">
                      {m.status === MatchStatus.Waiting && m.role === "guest"
                        ? "Join"
                        : "Open board"}
                    </Link>
                    {(m.ticket1 > 0n || m.ticket2 > 0n) && (
                      <Link href={ticketsHref} className="btn btn-ghost btn-sm">
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
          <section className="play-section">
            <h2 className="play-section-title">Past</h2>
            <p className="muted play-section-hint">
              Finished or cancelled. Check tickets if you need results or claims.
            </p>
            <div className="play-table-list">
              {pastMatches.map((m) => {
                const ticketsHref = `/play/match/${m.id.toString()}/tickets`;
                return (
                  <div
                    key={`past-${String(m.id)}`}
                    className="play-table-card play-table-card-past"
                  >
                    <div className="play-table-info">
                      <div className="play-table-title">
                        Table #{m.id.toString()}
                      </div>
                      <p className="muted play-table-meta">
                        {m.status === MatchStatus.Resolved
                          ? "Finished"
                          : m.status === MatchStatus.Cancelled
                            ? "Cancelled"
                            : statusLabel(m.status)}
                      </p>
                    </div>
                    {(m.ticket1 > 0n || m.ticket2 > 0n) && (
                      <div className="play-table-actions">
                        <Link
                          href={ticketsHref}
                          className="btn btn-ghost btn-sm"
                        >
                          Tickets &amp; results
                        </Link>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
