"use client";

import { GameBoard } from "@/components/GameBoard";
import { SiteNav } from "@/components/SiteNav";
import { TicketPicker } from "@/components/TicketPicker";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { getProfile } from "@/lib/profile";
import {
  useAccount,
  useConnect,
  usePublicClient,
} from "wagmi";
import { decodeEventLog, type Address, type Hex } from "viem";
import { ADDRESSES, MatchStatus, whotEscrowAbi } from "@/lib/contracts";
import {
  rememberMatchId,
  useEscrowActions,
  useEscrowReady,
} from "@/hooks/useEscrow";
import { useUserTickets } from "@/hooks/useUserTickets";
import { waitForBaseReceipt } from "@/lib/waitForReceipt";
import type { PlayerId } from "@/lib/whot/types";

type Gate = "pick" | "stake" | "play" | "settle";

function isMobile() {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

/**
 * Play vs AI:
 * - free: local practice, no stake
 * - paid: stake 1 Megapot ticket; house buys/stakes 1; both in escrow; winner takes both
 */
export default function PlayAiPage() {
  return (
    <Suspense
      fallback={
        <div className="landing-premium ds">
          <SiteNav />
          <main className="prem-main">
            <p className="muted">Loading…</p>
          </main>
        </div>
      }
    >
      <PlayAiInner />
    </Suspense>
  );
}

function PlayAiInner() {
  const search = useSearchParams();
  const modeParam = search.get("mode"); // free | paid | null
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending: connectPending } = useConnect();
  const publicClient = usePublicClient({ chainId: 8453 });
  const escrowReady = useEscrowReady();
  const { createMatch, submitResult, isPending } = useEscrowActions();
  const {
    stakeableTickets,
    stakeableCount,
    loading: ticketsLoading,
    error: ticketsError,
    refetch: refetchTickets,
  } = useUserTickets();

  const [gate, setGate] = useState<Gate>(() => {
    if (modeParam === "paid") return "stake";
    if (modeParam === "free") return "play";
    return "pick";
  });
  const [ticketId, setTicketId] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [houseReady, setHouseReady] = useState<boolean | null>(null);
  const [houseAddress, setHouseAddress] = useState<string | null>(null);

  const [matchId, setMatchId] = useState<string | null>(null);
  const [gameSeed, setGameSeed] = useState<string | null>(null);
  const [winnerAddr, setWinnerAddr] = useState<Address | null>(null);
  const [settleMsg, setSettleMsg] = useState<string | null>(null);
  const [settling, setSettling] = useState(false);

  const freeSeed = useMemo(
    () => `ai-free-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    []
  );

  const profile = address ? getProfile(address) : null;

  useEffect(() => {
    if (modeParam === "paid") setGate("stake");
    if (modeParam === "free") setGate("play");
  }, [modeParam]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/ai-match/status", { cache: "no-store" });
        const data = (await res.json()) as {
          ready?: boolean;
          houseAddress?: string;
        };
        if (!cancelled) {
          setHouseReady(!!data.ready);
          setHouseAddress(data.houseAddress || null);
        }
      } catch {
        if (!cancelled) setHouseReady(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onConnect = () => {
    const hasInjected =
      typeof window !== "undefined" &&
      typeof (window as Window & { ethereum?: unknown }).ethereum !==
        "undefined";
    if (isMobile() && !hasInjected) {
      window.location.href = `https://metamask.app.link/dapp/${window.location.host}${window.location.pathname}${window.location.search}`;
      return;
    }
    const primary =
      connectors.find((c) => c.type === "injected") || connectors[0];
    if (primary) connect({ connector: primary });
    else setError("Install MetaMask or open this site in a wallet browser.");
  };

  const startStakeMatch = useCallback(async () => {
    if (!address) {
      onConnect();
      return;
    }
    if (!escrowReady) {
      setError("Escrow not configured.");
      return;
    }
    if (!houseReady) {
      setError(
        "Agent is not configured on the server (AGENT_PRIVATE_KEY). Free practice still works."
      );
      return;
    }
    if (!ticketId) {
      setError("Select a stakeable Megapot ticket.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      setStatus("Approve ticket + create match (you stake 1)…");
      const hash = await createMatch(BigInt(ticketId));
      setStatus("Waiting for your stake on Base…");
      const receipt = await waitForBaseReceipt(hash, {
        client: publicClient,
        timeoutMs: 120_000,
      });
      let newMatchId: string | null = null;
      for (const log of receipt.logs) {
        try {
          const decoded = decodeEventLog({
            abi: whotEscrowAbi,
            data: log.data,
            topics: log.topics,
          });
          if (decoded.eventName === "MatchCreated") {
            newMatchId = (
              decoded.args as { matchId: bigint }
            ).matchId.toString();
            break;
          }
        } catch {
          /* not our event */
        }
      }
      if (!newMatchId) {
        throw new Error(
          "Match created but id not found in receipt. Check Live matches."
        );
      }
      rememberMatchId(BigInt(newMatchId));
      setMatchId(newMatchId);

      setStatus("Agent is staking its ticket (may buy one if needed)…");
      const joinRes = await fetch("/api/ai-match/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId: newMatchId }),
      });
      const joinData = (await joinRes.json()) as {
        ok?: boolean;
        error?: string;
        gameSeed?: string;
        houseAddress?: string;
      };
      if (!joinRes.ok || !joinData.ok) {
        throw new Error(joinData.error || "Agent could not join");
      }
      if (joinData.houseAddress) setHouseAddress(joinData.houseAddress);
      const seed = joinData.gameSeed || null;
      if (!seed || seed === "0x" + "0".repeat(64)) {
        // refetch match
        if (publicClient) {
          const m = (await publicClient.readContract({
            address: ADDRESSES.whotEscrow,
            abi: whotEscrowAbi,
            functionName: "getMatch",
            args: [BigInt(newMatchId)],
          })) as { gameSeed: Hex; status: number };
          if (m.status !== MatchStatus.Active) {
            throw new Error("Match not active after AI join");
          }
          setGameSeed(m.gameSeed);
        } else {
          throw new Error("No game seed after AI join");
        }
      } else {
        setGameSeed(seed);
      }
      setStatus(null);
      setGate("play");
      void refetchTickets();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Could not start AI match";
      if (/user rejected|denied|cancelled|canceled/i.test(msg)) {
        setError("Wallet cancelled.");
      } else {
        setError(msg);
      }
    } finally {
      setBusy(false);
      setStatus(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    address,
    escrowReady,
    houseReady,
    ticketId,
    createMatch,
    publicClient,
    refetchTickets,
  ]);

  const settleOnChain = useCallback(
    async (winner: Address) => {
      if (!matchId || !address) return;
      setSettling(true);
      setSettleMsg("Confirm result in wallet (you)…");
      try {
        await submitResult(BigInt(matchId), winner);
        setSettleMsg("Agent confirming so tickets transfer…");
        const res = await fetch("/api/ai-match/result", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ matchId, winner }),
        });
        const data = (await res.json()) as {
          ok?: boolean;
          error?: string;
          resolved?: boolean;
        };
        if (!res.ok || !data.ok) {
          setSettleMsg(
            data.error ||
              "House confirm failed — try again or wait; you already submitted."
          );
        } else if (data.resolved) {
          setSettleMsg(
            winner.toLowerCase() === address.toLowerCase()
              ? "Resolved! Both tickets transferred to you."
              : "Resolved. Both tickets went to the Agent."
          );
        } else {
          setSettleMsg(
            "Both sides submitted. Refresh tickets in a moment if transfer is pending."
          );
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Settle failed";
        setSettleMsg(msg);
      } finally {
        setSettling(false);
        void refetchTickets();
      }
    },
    [matchId, address, submitResult, refetchTickets]
  );

  const onWin = useCallback(
    (w: PlayerId) => {
      if (!matchId || !address || !houseAddress) return;
      const winner =
        w === "p1" ? (address as Address) : (houseAddress as Address);
      setWinnerAddr(winner);
      setGate("settle");
      void settleOnChain(winner);
    },
    [matchId, address, houseAddress, settleOnChain]
  );

  const onTimeoutForfeit = useCallback(
    (w: PlayerId) => {
      onWin(w);
    },
    [onWin]
  );

  // ── Free practice ──
  if (gate === "play" && !matchId) {
    return (
      <GameBoard
        seed={freeSeed}
        vsAi
        p1Name={profile?.username || "You"}
        p2Name="AI"
        showSoundToggle
        stakeTickets={0}
        potTickets={0}
        ticketBalance="Practice · free"
        meProfile={
          profile
            ? {
                username: profile.username,
                avatar: profile.avatar,
                color: profile.color,
              }
            : { username: "You", avatar: "🃏", color: "#c41e3a" }
        }
        oppProfile={{ username: "AI", avatar: "", color: "#3b82f6" }}
        backHref="/play"
      />
    );
  }

  // ── Paid stake match in progress ──
  if (gate === "play" && matchId && gameSeed) {
    return (
      <GameBoard
        seed={gameSeed}
        vsAi
        humanPlayer="p1"
        p1Name={profile?.username || "You"}
        p2Name="Agent"
        showSoundToggle
        stakeTickets={1}
        potTickets={2}
        ticketBalance="1 staked · winner takes both"
        onWin={onWin}
        onTimeoutForfeit={onTimeoutForfeit}
        meProfile={
          profile
            ? {
                username: profile.username,
                avatar: profile.avatar,
                color: profile.color,
              }
            : { username: "You", avatar: "🃏", color: "#c41e3a" }
        }
        oppProfile={{ username: "Agent", avatar: "", color: "#3b82f6" }}
        backHref="/play"
      />
    );
  }

  // ── Settlement screen ──
  if (gate === "settle" && matchId) {
    const youWon =
      !!address &&
      !!winnerAddr &&
      winnerAddr.toLowerCase() === address.toLowerCase();
    return (
      <div className="landing-premium ds">
        <SiteNav />
        <main className="prem-main ai-pay-main">
          <div className="ai-pay-panel">
            <p className="prem-how-eyebrow">Match #{matchId}</p>
            <h1 className="prem-h1 prem-h1-page">
              {youWon ? "You won both tickets" : "Agent wins both"}
            </h1>
            <p className="prem-lede">
              Dual confirm settles escrow. You and the Agent both submit the
              winner so both Megapot tickets transfer.
            </p>
            {settleMsg && (
              <div className={youWon ? "banner win" : "alert"} style={{ marginTop: 16 }}>
                {settleMsg}
              </div>
            )}
            <div className="ai-pay-actions" style={{ marginTop: 20 }}>
              {winnerAddr && (
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={settling || isPending}
                  onClick={() => void settleOnChain(winnerAddr)}
                >
                  {settling || isPending ? "Working…" : "Retry settle"}
                </button>
              )}
              <Link
                href={`/play/match/${matchId}/tickets`}
                className="btn btn-ghost"
              >
                Tickets &amp; prizes
              </Link>
              <Link href="/play" className="btn btn-ghost">
                Lobby
              </Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // ── Mode pick / stake gate ──
  return (
    <div className="landing-premium ds">
      <SiteNav />
      <main className="prem-main ai-pay-main">
        {gate === "pick" && (
          <div className="ai-pay-panel">
            <p className="prem-how-eyebrow">Play vs AI</p>
            <h1 className="prem-h1 prem-h1-page">Choose how you play</h1>
            <p className="prem-lede" style={{ maxWidth: "36em" }}>
              Practice free, or stake 1 Megapot ticket. The Agent stakes
              another — both lock in escrow. Winner takes both tickets.
            </p>
            <div className="ai-pay-grid">
              <button
                type="button"
                className="ai-pay-card free"
                onClick={() => setGate("play")}
              >
                <span className="ai-pay-badge">Free</span>
                <h2>Practice</h2>
                <p>No wallet · Learn rules · Replay anytime</p>
                <span className="ai-pay-cta">Start free</span>
              </button>
              <button
                type="button"
                className="ai-pay-card paid"
                onClick={() => setGate("stake")}
              >
                <span className="ai-pay-badge paid">Stake</span>
                <h2>Challenge Agent</h2>
                <p>1 ticket each · Escrow · Winner takes both</p>
                <span className="ai-pay-cta">Stake ticket</span>
              </button>
            </div>
            <Link href="/play" className="prem-btn-ghost sm" style={{ marginTop: 16 }}>
              ← Lobby
            </Link>
          </div>
        )}

        {gate === "stake" && (
          <div className="ai-pay-panel" style={{ textAlign: "left" }}>
            <p className="prem-how-eyebrow">Stake vs Agent</p>
            <h1 className="prem-h1 prem-h1-page" style={{ textAlign: "left", maxWidth: "none" }}>
              Lock 1 ticket — Agent locks 1
            </h1>
            <p className="muted">
              You stake a current-draw Megapot ticket. The Agent buys/stakes
              its own ticket into the same escrow. Play Whot —{" "}
              <strong style={{ color: "#fff" }}>winner takes both NFTs</strong>.
            </p>

            {houseReady === false && (
              <div className="alert" style={{ marginTop: 12 }}>
                Agent is offline. Funding the wallet is not enough — Vercel must
                have <code>AGENT_PRIVATE_KEY</code> set to the private key for{" "}
                <code>0xFD3f…ef2f0</code> (and ETH + USDC on that wallet). Free
                practice still works.
              </div>
            )}
            {houseReady && houseAddress && (
              <p className="muted" style={{ fontSize: "0.85rem" }}>
                Agent:{" "}
                <strong style={{ color: "#fff" }}>
                  {houseAddress.slice(0, 6)}…{houseAddress.slice(-4)}
                </strong>
              </p>
            )}

            <div className="ticket-badge" style={{ margin: "16px 0" }}>
              <div>
                <div className="muted">Your stakeable tickets</div>
                <strong>{isConnected ? stakeableCount : "—"}</strong>
              </div>
            </div>

            {!isConnected ? (
              <button
                type="button"
                className="btn btn-primary"
                disabled={connectPending}
                onClick={onConnect}
              >
                {connectPending ? "…" : "Connect wallet"}
              </button>
            ) : (
              <TicketPicker
                tickets={stakeableTickets}
                loading={ticketsLoading}
                error={ticketsError}
                selectedId={ticketId}
                onSelect={setTicketId}
              />
            )}

            {error && <div className="alert" style={{ marginTop: 12 }}>{error}</div>}
            {status && (
              <p className="muted" style={{ marginTop: 12 }}>
                {status}
              </p>
            )}

            <div className="ai-pay-actions" style={{ justifyContent: "flex-start", marginTop: 18 }}>
              <button
                type="button"
                className="btn btn-primary"
                disabled={
                  busy ||
                  isPending ||
                  !isConnected ||
                  !ticketId ||
                  !houseReady ||
                  !escrowReady
                }
                onClick={() => void startStakeMatch()}
              >
                {busy || isPending
                  ? "Working…"
                  : "Stake ticket & call Agent"}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={busy}
                onClick={() => setGate("play")}
              >
                Practice free
              </button>
              <Link href="/play" className="btn btn-ghost">
                ← Lobby
              </Link>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
