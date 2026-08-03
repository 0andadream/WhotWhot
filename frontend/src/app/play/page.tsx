"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { SiteNav } from "@/components/SiteNav";
import { ProfileAvatar } from "@/components/ProfileAvatar";
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
  useOpenTables,
  MatchStatus,
  type MatchSummary,
} from "@/hooks/useEscrow";
import { ADDRESSES, erc20Abi, randomBuyerAbi } from "@/lib/contracts";
import { stringToHex, parseUnits, type Address } from "viem";
import { getProfile } from "@/lib/profile";
import { WHOT_EASE } from "@/components/landing/motion";

type Screen = "modes" | "friends";
type HistoryTab = "live" | "past";

function isMobile() {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

const ease = WHOT_EASE;

export default function PlayLobbyPage() {
  const router = useRouter();
  const reduce = useReducedMotion();
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
  const { tables: openTables, loading: openLoading, refetch: refetchOpen } =
    useOpenTables();
  const { isSuccess, error } = useBuyRandomTicket();
  const { writeContractAsync } = useWriteContract();
  const [buyStep, setBuyStep] = useState<"idle" | "approve" | "buy">("idle");
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [screen, setScreen] = useState<Screen>("modes");
  const [historyTab, setHistoryTab] = useState<HistoryTab>("live");
  const [openProfiles, setOpenProfiles] = useState<
    Record<string, { username: string; avatar: string; color: string }>
  >({});

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

  // Load host profiles for open tables
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const next: typeof openProfiles = {};
      await Promise.all(
        openTables.map(async (t) => {
          try {
            const res = await fetch(
              `/api/match/${t.id.toString()}/profiles`,
              { cache: "no-store" }
            );
            if (!res.ok) return;
            const data = (await res.json()) as {
              profiles?: Record<
                string,
                { username: string; avatar: string; color: string }
              >;
            };
            const host = data.profiles?.[t.player1.toLowerCase()];
            if (host) next[t.player1.toLowerCase()] = host;
          } catch {
            /* ignore */
          }
        })
      );
      if (!cancelled) setOpenProfiles((p) => ({ ...p, ...next }));
    };
    if (openTables.length) void load();
    return () => {
      cancelled = true;
    };
  }, [openTables]);

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
    if (primary) connect({ connector: primary });
    else setStatusMsg("Install MetaMask or open this site in a wallet browser.");
  };

  const onBuyOrConnect = () => {
    if (!isConnected) onConnectWallet();
    else void onBuyTicket();
  };

  const hostLabel = useCallback(
    (addr: Address) => {
      const p = openProfiles[addr.toLowerCase()];
      if (p?.username) return p;
      if (address && addr.toLowerCase() === address.toLowerCase()) {
        const mine = getProfile(address);
        if (mine) return mine;
      }
      return {
        username: `${addr.slice(0, 6)}…${addr.slice(-4)}`,
        avatar: "🃏",
        color: "#c41e3a",
      };
    },
    [openProfiles, address]
  );

  const motionProps = reduce
    ? {}
    : {
        initial: { opacity: 0, y: 16 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.45, ease },
      };

  return (
    <div className="landing-premium ds play-lobby-v2">
      <SiteNav />
      <main className="play-v2">
        {/* Compact ticket strip */}
        <div className="play-v2-strip">
          <div className="play-v2-strip-stats">
            <span>
              <em>Jackpot</em> {jackpot.prizePoolUsd ?? "…"}
            </span>
            <span>
              <em>Draw</em> {countdown}
            </span>
            <span>
              <em>Tickets</em> {isConnected ? stakeableCount : "—"}
            </span>
          </div>
          <button
            type="button"
            className="prem-btn-white sm"
            disabled={connectPending || (isConnected && buyStep !== "idle")}
            onClick={onBuyOrConnect}
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
        </div>
        {(statusMsg || error) && (
          <div className="alert" style={{ margin: "0 0 12px" }}>
            {statusMsg ||
              (error instanceof Error ? error.message : String(error))}
          </div>
        )}

        {screen === "modes" && (
          <ModeSelect
            reduce={!!reduce}
            onAi={() => router.push("/play/ai")}
            onFriends={() => setScreen("friends")}
            escrowReady={escrowReady}
          />
        )}

        {screen === "friends" && (
          <motion.div {...motionProps} className="play-v2-friends">
            <button
              type="button"
              className="play-v2-back"
              onClick={() => setScreen("modes")}
            >
              ← How do you want to play?
            </button>

            <div className="play-v2-lobby-actions">
              <Link
                href={escrowReady ? "/play/create" : "#"}
                className={`play-v2-btn-primary${!escrowReady ? " disabled" : ""}`}
              >
                Create a Table
              </Link>
              <Link
                href={escrowReady ? "/play/join" : "#"}
                className={`play-v2-btn-secondary${!escrowReady ? " disabled" : ""}`}
              >
                Join with Code
              </Link>
            </div>

            <section className="play-v2-section">
              <div className="play-v2-section-head">
                <h2>Open tables waiting for players</h2>
                <button
                  type="button"
                  className="prem-btn-ghost sm"
                  onClick={() => void refetchOpen()}
                >
                  Refresh
                </button>
              </div>

              {openLoading && (
                <p className="play-v2-empty-text">Loading open tables…</p>
              )}

              {!openLoading && openTables.length === 0 && (
                <div className="play-v2-empty">
                  <p>No open tables right now. Be the first — create one!</p>
                  <Link
                    href={escrowReady ? "/play/create" : "#"}
                    className="play-v2-btn-primary"
                  >
                    Create a Table
                  </Link>
                </div>
              )}

              <div className="play-v2-open-list">
                {openTables.map((t, i) => {
                  const host = hostLabel(t.player1);
                  return (
                    <motion.div
                      key={t.id.toString()}
                      className="play-v2-open-card"
                      initial={reduce ? false : { opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{
                        delay: reduce ? 0 : i * 0.05,
                        duration: 0.35,
                        ease,
                      }}
                    >
                      <div className="play-v2-open-host">
                        <ProfileAvatar profile={host} size={40} />
                        <div>
                          <strong>{host.username}</strong>
                          <span>Waiting for 1 more player</span>
                        </div>
                      </div>
                      <div className="play-v2-open-meta">
                        <span className="play-v2-stake">1 ticket stake</span>
                        <span className="play-v2-table-id">
                          #{t.id.toString()}
                        </span>
                      </div>
                      <Link
                        href={`/play/join?matchId=${t.id.toString()}`}
                        className="play-v2-join-btn"
                      >
                        Join
                      </Link>
                    </motion.div>
                  );
                })}
              </div>
            </section>

            <section className="play-v2-section">
              <div className="play-v2-tabs">
                <button
                  type="button"
                  className={historyTab === "live" ? "active" : ""}
                  onClick={() => setHistoryTab("live")}
                >
                  Live
                </button>
                <button
                  type="button"
                  className={historyTab === "past" ? "active" : ""}
                  onClick={() => setHistoryTab("past")}
                >
                  Past
                </button>
                <button
                  type="button"
                  className="play-v2-tabs-refresh"
                  onClick={() => void refetchMine()}
                >
                  Refresh
                </button>
              </div>

              {historyTab === "live" && (
                <HistoryLive
                  matches={myMatches}
                  loading={myLoading}
                  address={address}
                />
              )}
              {historyTab === "past" && (
                <HistoryPast
                  matches={pastMatches}
                  loading={myLoading}
                  address={address}
                />
              )}
            </section>
          </motion.div>
        )}
      </main>
    </div>
  );
}

function ModeSelect({
  onAi,
  onFriends,
  escrowReady,
  reduce,
}: {
  onAi: () => void;
  onFriends: () => void;
  escrowReady: boolean;
  reduce: boolean;
}) {
  return (
    <motion.section
      className="play-v2-modes"
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease }}
    >
      <h1 className="play-v2-title">How do you want to play?</h1>
      <div className="play-v2-mode-grid">
        <motion.button
          type="button"
          className="play-v2-mode-card teal"
          onClick={onAi}
          whileHover={reduce ? undefined : { scale: 1.02, y: -2 }}
          whileTap={reduce ? undefined : { scale: 0.99 }}
          transition={{ type: "spring", stiffness: 400, damping: 22 }}
        >
          <span className="play-v2-mode-icon teal" aria-hidden>
            <RobotIcon />
          </span>
          <h2>Play vs AI</h2>
          <p>Practice free · No wallet needed · Learn the rules</p>
          <span className="play-v2-mode-start">Start</span>
        </motion.button>

        <motion.button
          type="button"
          className="play-v2-mode-card purple"
          onClick={() => escrowReady && onFriends()}
          disabled={!escrowReady}
          whileHover={
            reduce || !escrowReady
              ? undefined
              : { scale: 1.02, y: -2 }
          }
          whileTap={
            reduce || !escrowReady ? undefined : { scale: 0.99 }
          }
          transition={{ type: "spring", stiffness: 400, damping: 22 }}
        >
          <span className="play-v2-mode-icon purple" aria-hidden>
            <FriendsIcon />
          </span>
          <h2>Play with Friends</h2>
          <p>Stake tickets · Create or join a table · Winner takes both</p>
          <span className="play-v2-mode-start">Start</span>
        </motion.button>
      </div>
    </motion.section>
  );
}

function HistoryLive({
  matches,
  loading,
  address,
}: {
  matches: MatchSummary[];
  loading: boolean;
  address?: Address;
}) {
  if (loading) {
    return <p className="play-v2-empty-text">Loading your tables…</p>;
  }
  if (!address) {
    return (
      <p className="play-v2-empty-text">
        Connect your wallet to see live tables.
      </p>
    );
  }
  if (matches.length === 0) {
    return (
      <p className="play-v2-empty-text">
        No live tables. Create one or join an open table above.
      </p>
    );
  }
  return (
    <div className="play-v2-history-list">
      {matches.map((m) => {
        const href =
          m.status === MatchStatus.Waiting && m.role === "guest"
            ? `/play/join?matchId=${m.id}`
            : `/play/match/${m.id.toString()}`;
        return (
          <div key={m.id.toString()} className="play-v2-history-card">
            <div>
              <div className="play-v2-history-title">
                Table #{m.id.toString()}
                <span
                  className={`play-v2-badge ${
                    m.status === MatchStatus.Active ? "live" : "wait"
                  }`}
                >
                  {m.status === MatchStatus.Active ? "In Progress" : "Waiting"}
                </span>
              </div>
              <p className="play-v2-history-meta">
                {m.role === "host" ? "You host" : "You joined"} · 1 ticket
              </p>
            </div>
            <Link href={href} className="prem-btn-white sm">
              Open
            </Link>
          </div>
        );
      })}
    </div>
  );
}

function HistoryPast({
  matches,
  loading,
  address,
}: {
  matches: MatchSummary[];
  loading: boolean;
  address?: Address;
}) {
  if (loading) {
    return <p className="play-v2-empty-text">Loading history…</p>;
  }
  if (!address) {
    return (
      <p className="play-v2-empty-text">Connect to see past matches.</p>
    );
  }
  if (matches.length === 0) {
    return (
      <p className="play-v2-empty-text">No past matches yet. Play a game!</p>
    );
  }

  const me = address.toLowerCase();

  return (
    <div className="play-v2-history-list">
      {matches.map((m) => {
        const opp =
          m.player1.toLowerCase() === me ? m.player2 : m.player1;
        const won =
          m.winner && m.winner.toLowerCase() === me
            ? "won"
            : m.winner
              ? "lost"
              : m.status === MatchStatus.Cancelled
                ? "cancel"
                : "done";
        const date =
          m.startedAt || m.createdAt
            ? new Date((m.startedAt || m.createdAt)! * 1000).toLocaleDateString()
            : "";
        return (
          <div key={m.id.toString()} className="play-v2-history-card past">
            <div>
              <div className="play-v2-history-title">
                Table #{m.id.toString()}
                {won === "won" && (
                  <span className="play-v2-badge won">Won</span>
                )}
                {won === "lost" && (
                  <span className="play-v2-badge lost">Lost</span>
                )}
                {won === "cancel" && (
                  <span className="play-v2-badge wait">Cancelled</span>
                )}
                {won === "done" && (
                  <span className="play-v2-badge wait">Finished</span>
                )}
              </div>
              <p className="play-v2-history-meta">
                vs {opp.slice(0, 6)}…{opp.slice(-4)} · tickets
                {date ? ` · ${date}` : ""}
              </p>
            </div>
            <div className="play-v2-history-actions">
              <Link
                href={`/play/match/${m.id.toString()}/tickets`}
                className="prem-btn-ghost sm"
              >
                Tickets
              </Link>
              <Link href="/play/create" className="prem-btn-white sm">
                Rematch
              </Link>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RobotIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <rect x="5" y="9" width="14" height="10" rx="2" />
      <path d="M9 9V7a3 3 0 0 1 6 0v2" />
      <circle cx="9.5" cy="13.5" r="1" fill="currentColor" />
      <circle cx="14.5" cy="13.5" r="1" fill="currentColor" />
      <path d="M12 4v2M8 19v1M16 19v1" />
    </svg>
  );
}

function FriendsIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <circle cx="9" cy="8" r="3" />
      <path d="M3 19c0-3 2.5-5 6-5s6 2 6 5" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M21 19c0-2.2-1.5-3.8-4-4.5" />
    </svg>
  );
}
