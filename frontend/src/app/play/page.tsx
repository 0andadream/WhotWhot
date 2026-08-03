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
    <div className="landing-premium ds play-screen">
      <SiteNav />
      <main className="play-fit">
        <header className="play-fit-hero">
          <h1>Play Whot</h1>
          <p>Practice free, or stake 1 ticket · winner takes both</p>
        </header>

        <section className="play-fit-bar">
          <div className="play-fit-stat">
            <span className="lbl">Jackpot</span>
            <span className="val">{jackpot.prizePoolUsd ?? "…"}</span>
          </div>
          <div className="play-fit-stat">
            <span className="lbl">Draw</span>
            <span className="val sm">{countdown}</span>
          </div>
          <div className="play-fit-stat">
            <span className="lbl">Tickets</span>
            <span className="val">{isConnected ? stakeableCount : "—"}</span>
          </div>
          <button
            type="button"
            className="prem-btn-white sm"
            disabled={connectPending || (isConnected && buyStep !== "idle")}
            onClick={(e) => {
              e.preventDefault();
              onBuyOrConnect();
            }}
          >
            {!isConnected
              ? connectPending
                ? "…"
                : "Connect to buy"
              : buyStep === "approve"
                ? "Approve…"
                : buyStep === "buy"
                  ? "Buying…"
                  : `Buy · ${jackpot.ticketPriceUsd ?? "$1"}`}
          </button>
        </section>
        {(statusMsg || error) && (
          <div className="alert play-fit-alert">
            {statusMsg ||
              (error instanceof Error ? error.message : String(error))}
          </div>
        )}

        <section className="play-fit-modes">
          <Link href="/play/ai" className="play-fit-mode">
            <span className="prem-mode-tag free">Free</span>
            <strong>Play free</strong>
            <span className="sub">vs AI</span>
          </Link>
          <Link
            href={escrowReady ? "/play/create" : "#"}
            className="play-fit-mode"
            style={
              !escrowReady ? { opacity: 0.5, pointerEvents: "none" } : undefined
            }
          >
            <span className="prem-mode-tag stake">Stake</span>
            <strong>Create</strong>
            <span className="sub">new table</span>
          </Link>
          <Link
            href={escrowReady ? "/play/join" : "#"}
            className="play-fit-mode"
            style={
              !escrowReady ? { opacity: 0.5, pointerEvents: "none" } : undefined
            }
          >
            <span className="prem-mode-tag stake">Stake</span>
            <strong>Join</strong>
            <span className="sub">with ID</span>
          </Link>
        </section>

        <section className="play-fit-tables">
          <div className="play-fit-tables-head">
            <h2>Your tables</h2>
            <button
              type="button"
              className="prem-btn-ghost"
              style={{
                minHeight: 32,
                padding: "4px 10px",
                fontSize: "0.78rem",
              }}
              onClick={() => void refetchMine()}
            >
              Refresh
            </button>
          </div>

          <div className="play-fit-tables-scroll">
            {!isConnected && (
              <p className="play-fit-empty">
                Connect wallet to see your tables.
              </p>
            )}
            {isConnected && myLoading && (
              <p className="play-fit-empty">Loading…</p>
            )}
            {isConnected &&
              !myLoading &&
              myMatches.length === 0 &&
              pastMatches.length === 0 && (
                <p className="play-fit-empty">
                  No tables yet. Create or join one above.
                </p>
              )}

            {myMatches.map((m) => {
              const boardHref =
                m.status === MatchStatus.Waiting && m.role === "guest"
                  ? `/play/join?matchId=${m.id}`
                  : `/play/match/${m.id.toString()}`;
              return (
                <div key={String(m.id)} className="play-fit-row">
                  <div>
                    <strong>#{m.id.toString()}</strong>
                    <span>
                      {m.role === "host" ? "Host" : "Joined"} ·{" "}
                      {m.status === MatchStatus.Active
                        ? "Live"
                        : m.status === MatchStatus.Waiting
                          ? "Waiting"
                          : statusLabel(m.status)}
                    </span>
                  </div>
                  <Link href={boardHref} className="prem-btn-white sm">
                    Open
                  </Link>
                </div>
              );
            })}

            {pastMatches.slice(0, 4).map((m) => (
              <div key={`p-${String(m.id)}`} className="play-fit-row past">
                <div>
                  <strong>#{m.id.toString()}</strong>
                  <span>
                    {m.status === MatchStatus.Resolved
                      ? "Finished"
                      : "Cancelled"}
                  </span>
                </div>
                <Link
                  href={`/play/match/${m.id.toString()}/tickets`}
                  className="prem-btn-ghost"
                  style={{
                    minHeight: 32,
                    padding: "4px 10px",
                    fontSize: "0.78rem",
                  }}
                >
                  Tickets
                </Link>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
