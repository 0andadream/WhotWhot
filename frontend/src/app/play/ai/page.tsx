"use client";

import { GameBoard } from "@/components/GameBoard";
import { SiteNav } from "@/components/SiteNav";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { getProfile } from "@/lib/profile";
import {
  useAccount,
  useConnect,
  usePublicClient,
  useReadContract,
  useWriteContract,
} from "wagmi";
import { formatUnits } from "viem";
import { ADDRESSES, erc20Abi } from "@/lib/contracts";
import {
  AI_ENTRY_USDC,
  aiEntryFeeRaw,
  aiEntryLabel,
  aiTreasury,
  getAiPaidSession,
  setAiPaidSession,
} from "@/lib/aiPaid";
import { waitForBaseReceipt } from "@/lib/waitForReceipt";

type Gate = "pick" | "pay" | "play";

function isMobile() {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

/**
 * Play vs AI — free practice or paid challenge (USDC entry → treasury).
 * Paid revenue goes to ADDRESSES.megapotReferrer / NEXT_PUBLIC_AI_TREASURY_ADDRESS.
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
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient({ chainId: 8453 });

  const [gate, setGate] = useState<Gate>(() => {
    if (modeParam === "paid") return "pay";
    if (modeParam === "free") return "play";
    return "pick";
  });
  const [paid, setPaid] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const seed = useMemo(
    () => `ai-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    // new seed when entering play so rematches after pay stay fresh
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [gate, paid]
  );

  const profile = address ? getProfile(address) : null;
  const feeRaw = aiEntryFeeRaw();
  const treasury = aiTreasury();

  const { data: usdcBalance, refetch: refetchBal } = useReadContract({
    address: ADDRESSES.usdc,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: 8453,
    query: { enabled: !!address && gate === "pay", refetchInterval: 12_000 },
  });

  // Restore paid session (2h) so refresh doesn't re-charge mid-game
  useEffect(() => {
    if (!address) return;
    const s = getAiPaidSession(address);
    if (s) {
      setPaid(true);
      if (modeParam === "paid" || gate === "pay") setGate("play");
    }
  }, [address, modeParam, gate]);

  useEffect(() => {
    if (modeParam === "paid") setGate("pay");
    if (modeParam === "free") setGate("play");
  }, [modeParam]);

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

  const onPay = useCallback(async () => {
    if (!address) {
      onConnect();
      return;
    }
    setError(null);
    setStatus(null);
    try {
      const bal = usdcBalance ?? 0n;
      if (bal < feeRaw) {
        setError(
          `Need ${aiEntryLabel()} on Base. Buy USDC or a Megapot ticket from the lobby, then come back.`
        );
        return;
      }
      setBusy(true);
      setStatus(`Confirm ${aiEntryLabel()} entry fee in your wallet…`);
      const hash = await writeContractAsync({
        address: ADDRESSES.usdc,
        abi: erc20Abi,
        functionName: "transfer",
        args: [treasury, feeRaw],
        chainId: 8453,
      });
      setStatus("Payment submitted — confirming on Base…");
      try {
        await waitForBaseReceipt(hash, {
          client: publicClient,
          timeoutMs: 120_000,
        });
      } catch {
        // May still succeed — unlock if we got a hash; user can re-check
        setStatus(
          "Confirmation slow — if your wallet shows success, you’re in."
        );
      }
      setAiPaidSession(address, hash);
      setPaid(true);
      setGate("play");
      setStatus(null);
      void refetchBal();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Payment failed";
      if (/user rejected|denied|cancelled|canceled/i.test(msg)) {
        setError("Wallet cancelled the payment.");
      } else {
        setError(msg);
      }
    } finally {
      setBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, feeRaw, treasury, usdcBalance, writeContractAsync, publicClient, refetchBal]);

  const board = (
    <GameBoard
      seed={seed}
      vsAi
      p1Name={profile?.username || "You"}
      p2Name="AI"
      showSoundToggle
      stakeTickets={paid ? 1 : 0}
      potTickets={paid ? 1 : 0}
      ticketBalance={
        paid
          ? `Paid · ${aiEntryLabel()} entry`
          : "Practice · free"
      }
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

  if (gate === "play") {
    return board;
  }

  const balLabel =
    usdcBalance !== undefined
      ? `$${Number(formatUnits(usdcBalance, 6)).toFixed(2)} USDC`
      : isConnected
        ? "…"
        : "—";

  return (
    <div className="landing-premium ds">
      <SiteNav />
      <main className="prem-main ai-pay-main">
        {gate === "pick" && (
          <div className="ai-pay-panel">
            <p className="prem-how-eyebrow">Play vs AI</p>
            <h1 className="prem-h1 prem-h1-page">Choose how you play</h1>
            <p className="prem-lede" style={{ maxWidth: "36em" }}>
              Practice free anytime, or pay a small entry fee to challenge the AI
              for real — fees go to the WhotWhot treasury on Base.
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
                onClick={() => setGate("pay")}
              >
                <span className="ai-pay-badge paid">Paid</span>
                <h2>Challenge AI</h2>
                <p>
                  {aiEntryLabel()} entry · USDC on Base · Supports the table
                </p>
                <span className="ai-pay-cta">Continue</span>
              </button>
            </div>

            <p className="ai-pay-note muted">
              Paid entry is a flat fee (not a stake pot). You keep your Megapot
              tickets. Want tickets?{" "}
              <Link href="/play">Buy from the lobby</Link> — that also earns
              protocol referral fees for the site.
            </p>
            <Link href="/play" className="prem-btn-ghost sm" style={{ marginTop: 12 }}>
              ← Lobby
            </Link>
          </div>
        )}

        {gate === "pay" && (
          <div className="ai-pay-panel">
            <p className="prem-how-eyebrow">Paid challenge</p>
            <h1 className="prem-h1 prem-h1-page">
              Pay {aiEntryLabel()} to play AI
            </h1>
            <p className="prem-lede">
              One-time entry for this session (about 2 hours). USDC is sent to
              the WhotWhot treasury on Base — not locked in escrow.
            </p>

            <div className="ai-pay-summary">
              <div>
                <em>Entry fee</em>
                <strong>{aiEntryLabel()}</strong>
              </div>
              <div>
                <em>Your USDC</em>
                <strong>{balLabel}</strong>
              </div>
              <div>
                <em>Treasury</em>
                <strong className="ai-pay-addr">
                  {treasury.slice(0, 6)}…{treasury.slice(-4)}
                </strong>
              </div>
            </div>

            {error && <div className="alert">{error}</div>}
            {status && !error && (
              <p className="muted" style={{ marginTop: 12 }}>
                {status}
              </p>
            )}

            <div className="ai-pay-actions">
              {!isConnected ? (
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={connectPending || busy}
                  onClick={onConnect}
                >
                  {connectPending ? "…" : "Connect wallet"}
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={busy}
                  onClick={() => void onPay()}
                >
                  {busy
                    ? "Confirm in wallet…"
                    : `Pay ${aiEntryLabel()} & play`}
                </button>
              )}
              <button
                type="button"
                className="btn btn-ghost"
                disabled={busy}
                onClick={() => setGate("play")}
              >
                Play free instead
              </button>
              <Link href="/play" className="btn btn-ghost">
                ← Lobby
              </Link>
            </div>

            <p className="ai-pay-note muted">
              Fee amount: {AI_ENTRY_USDC} USDC (6 decimals on Base). Need funds?{" "}
              <Link href="/play">Buy a Megapot ticket</Link> from the lobby.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
