"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { SiteNav } from "@/components/SiteNav";
import { ProfileAvatar } from "@/components/ProfileAvatar";
import { HeroCardFan } from "@/components/landing/HeroCardFan";
import {
  useAccount,
  useConnect,
  usePublicClient,
  useReadContract,
  useWriteContract,
} from "wagmi";
import { useCountdown, useJackpotInfo } from "@/hooks/useMegapot";
import { useUserTickets } from "@/hooks/useUserTickets";
import {
  useEscrowReady,
  useEscrowActions,
  useMyMatches,
  useOpenTables,
  MatchStatus,
  type MatchSummary,
} from "@/hooks/useEscrow";
import { ADDRESSES, erc20Abi, randomBuyerAbi } from "@/lib/contracts";
import { stringToHex, parseUnits, type Address } from "viem";
import { getProfile } from "@/lib/profile";
import { WHOT_EASE } from "@/components/landing/motion";
import { waitForBaseReceipt } from "@/lib/waitForReceipt";

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
  const { cancelWaiting, isPending: cancelPending } = useEscrowActions();
  const { tables: openTables, loading: openLoading, refetch: refetchOpen } =
    useOpenTables();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient({ chainId: 8453 });
  const { data: usdcAllowance, refetch: refetchAllowance } = useReadContract({
    address: ADDRESSES.usdc,
    abi: erc20Abi,
    functionName: "allowance",
    args:
      address && ADDRESSES.jackpotRandomTicketBuyer
        ? [address, ADDRESSES.jackpotRandomTicketBuyer]
        : undefined,
    chainId: 8453,
    query: { enabled: !!address, refetchInterval: 20_000 },
  });
  const [buyStep, setBuyStep] = useState<
    "idle" | "approve" | "buy" | "confirming"
  >("idle");
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [buyError, setBuyError] = useState<string | null>(null);
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
    const price = jackpot.ticketPriceRaw;
    try {
      setStatusMsg(null);
      setBuyError(null);

      // Skip approve if allowance already covers this ticket
      let allowance = usdcAllowance ?? 0n;
      try {
        const fresh = await refetchAllowance();
        if (typeof fresh.data === "bigint") allowance = fresh.data;
      } catch {
        /* use cached */
      }

      if (allowance < price) {
        setBuyStep("approve");
        setStatusMsg("Approve USDC in your wallet…");
        const approveHash = await writeContractAsync({
          address: ADDRESSES.usdc,
          abi: erc20Abi,
          functionName: "approve",
          args: [ADDRESSES.jackpotRandomTicketBuyer, price],
          chainId: 8453,
        });
        setStatusMsg("Waiting for USDC approval on Base…");
        await waitForBaseReceipt(approveHash, { client: publicClient });
        void refetchAllowance();
      }

      setBuyStep("buy");
      setStatusMsg("Confirm ticket purchase in your wallet…");
      const referrer = ADDRESSES.megapotReferrer;
      const source = stringToHex(
        process.env.NEXT_PUBLIC_SOURCE_TAG || "whotwhot",
        { size: 32 }
      );
      const hasReferrer =
        !!referrer &&
        referrer !== "0x0000000000000000000000000000000000000000";
      const buyHash = await writeContractAsync({
        address: ADDRESSES.jackpotRandomTicketBuyer,
        abi: randomBuyerAbi,
        functionName: "buyTickets",
        args: [
          1n,
          address,
          hasReferrer ? [referrer] : [],
          // 100% of referral weight to site wallet (1e18 = 100%)
          hasReferrer ? [parseUnits("1", 18)] : [],
          source,
        ],
        chainId: 8453,
      });

      setBuyStep("confirming");
      setStatusMsg("Purchase submitted — waiting for Base confirmation…");
      try {
        await waitForBaseReceipt(buyHash, {
          client: publicClient,
          timeoutMs: 180_000,
          pollMs: 2_000,
        });
      } catch (waitErr: unknown) {
        // Tx may still land; refresh tickets instead of hard-failing the buy
        setStatusMsg(
          "Confirmation is slow on public RPC — checking if your ticket arrived…"
        );
        await refetchTickets();
        await new Promise((r) => setTimeout(r, 4000));
        await refetchTickets();
        const msg =
          waitErr instanceof Error
            ? waitErr.message
            : "Confirmation timed out";
        setBuyStep("idle");
        setStatusMsg(
          `${msg} If the wallet shows success, wait a few seconds and your ticket count will update.`
        );
        window.setTimeout(() => void refetchTickets(), 3000);
        window.setTimeout(() => void refetchTickets(), 8000);
        window.setTimeout(() => setStatusMsg(null), 14_000);
        return;
      }

      setBuyStep("idle");
      setStatusMsg("Ticket purchased! Updating your balance…");
      // NFT index can lag a few seconds after mint
      await refetchTickets();
      window.setTimeout(() => void refetchTickets(), 2500);
      window.setTimeout(() => {
        void refetchTickets();
        setStatusMsg("Ticket ready — you can stake it now.");
      }, 6000);
      window.setTimeout(() => setStatusMsg(null), 10_000);
    } catch (e: unknown) {
      setBuyStep("idle");
      const err = e instanceof Error ? e.message : "Purchase failed";
      // User rejected in wallet — short message
      if (/user rejected|denied|cancelled|canceled/i.test(err)) {
        setBuyError("Wallet cancelled the transaction.");
        setStatusMsg(null);
        return;
      }
      setBuyError(err);
      setStatusMsg(err);
      // Still refresh — buy may have mined despite a wait error
      window.setTimeout(() => void refetchTickets(), 2000);
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
        {/* Live Megapot + ticket count (number only — no NFT images) */}
        <div className="play-v2-strip">
          <div className="play-v2-strip-stats">
            <span>
              <em>Jackpot</em> {jackpot.prizePoolUsd ?? "…"}
            </span>
            <span>
              <em>Draw</em> {countdown}
            </span>
            <span>
              <em>Megapot Tickets</em>{" "}
              {isConnected ? stakeableCount : "—"}
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
                  ? "Buy in wallet…"
                  : buyStep === "confirming"
                    ? "Confirming…"
                    : `Buy · ${jackpot.ticketPriceUsd ?? "$1"}`}
          </button>
        </div>
        {(statusMsg || buyError) && (
          <div className="alert" style={{ margin: "0 0 12px" }}>
            {statusMsg || buyError}
          </div>
        )}

        {screen === "modes" && (
          <ModeSelect
            reduce={!!reduce}
            onAiFree={() => router.push("/play/ai?mode=free")}
            onAiPaid={() => router.push("/play/ai?mode=paid")}
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

            <div className="play-v2-trust">
              <p>
                <strong>Winner takes both</strong> — one ticket each; dual
                confirm sends both NFTs to the winner.
              </p>
              <p>
                <strong>2-hour cancel</strong> — abandoned match? Either side
                can cancel after 2 hours and get their ticket back.
              </p>
              <p>
                <strong>Mid-escrow draw</strong> — if Megapot draws while tickets
                are locked, prizes stay on the NFTs. Claim on the tickets page
                after settle or cancel.
              </p>
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
                  cancelPending={cancelPending}
                  onCancelWaiting={async (id) => {
                    await cancelWaiting(id);
                    void refetchMine();
                    void refetchTickets();
                  }}
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
  onAiFree,
  onAiPaid,
  onFriends,
  escrowReady,
  reduce,
}: {
  onAiFree: () => void;
  onAiPaid: () => void;
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

      <HeroCardFan showFloaters={false} compact />

      <div className="play-v2-mode-grid play-v2-mode-grid-3">
        <motion.button
          type="button"
          className="play-v2-mode-card teal"
          onClick={onAiFree}
          whileHover={reduce ? undefined : { scale: 1.02, y: -2 }}
          whileTap={reduce ? undefined : { scale: 0.99 }}
          transition={{ type: "spring", stiffness: 400, damping: 22 }}
        >
          <h2>Practice vs AI</h2>
          <p>Free · No wallet · Learn the rules</p>
          <span className="play-v2-mode-start">Start free</span>
        </motion.button>

        <motion.button
          type="button"
          className="play-v2-mode-card gold"
          onClick={onAiPaid}
          whileHover={reduce ? undefined : { scale: 1.02, y: -2 }}
          whileTap={reduce ? undefined : { scale: 0.99 }}
          transition={{ type: "spring", stiffness: 400, damping: 22 }}
        >
          <h2>Challenge Agent</h2>
          <p>Stake tickets · Winner takes both</p>
          <span className="play-v2-mode-start">Stake &amp; play</span>
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
          <h2>Play with Friends</h2>
          <p>Stake tickets · Winner takes both</p>
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
  cancelPending,
  onCancelWaiting,
}: {
  matches: MatchSummary[];
  loading: boolean;
  address?: Address;
  cancelPending?: boolean;
  onCancelWaiting?: (id: bigint) => Promise<void>;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

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
      {err && (
        <div className="alert" style={{ marginBottom: 10 }}>
          {err}
        </div>
      )}
      {matches.map((m) => {
        const href =
          m.status === MatchStatus.Waiting && m.role === "guest"
            ? `/play/join?matchId=${m.id}`
            : `/play/match/${m.id.toString()}`;
        const canCancel =
          m.status === MatchStatus.Waiting &&
          m.role === "host" &&
          !!onCancelWaiting;
        const idStr = m.id.toString();
        return (
          <div key={idStr} className="play-v2-history-card">
            <div>
              <div className="play-v2-history-title">
                Table #{idStr}
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
            <div className="play-v2-history-actions">
              <Link href={href} className="prem-btn-white sm">
                Open
              </Link>
              {canCancel && (
                <button
                  type="button"
                  className="prem-btn-ghost sm"
                  disabled={cancelPending || busyId === idStr}
                  onClick={() => {
                    setErr(null);
                    setBusyId(idStr);
                    void onCancelWaiting!(m.id)
                      .then(() => setBusyId(null))
                      .catch((e: unknown) => {
                        setBusyId(null);
                        setErr(
                          e instanceof Error ? e.message : "Cancel failed"
                        );
                      });
                  }}
                >
                  {busyId === idStr || cancelPending
                    ? "Cancelling…"
                    : "Cancel (before start)"}
                </button>
              )}
            </div>
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


