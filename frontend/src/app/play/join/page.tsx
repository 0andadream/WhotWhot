"use client";

import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { SiteNav } from "@/components/SiteNav";
import { TicketPicker } from "@/components/TicketPicker";
import { ProfileAvatar } from "@/components/ProfileAvatar";
import { useAccount } from "wagmi";
import { zeroAddress, type Address } from "viem";
import {
  useEscrowActions,
  useEscrowReady,
  useMatch,
  rememberMatchId,
} from "@/hooks/useEscrow";
import { useUserTickets } from "@/hooks/useUserTickets";
import {
  getSavedDisplayName,
  sanitizeName,
  saveDisplayName,
  setMatchPlayerName,
} from "@/lib/displayName";
import {
  defaultUsername,
  ensureProfile,
  getProfile,
} from "@/lib/profile";
import { MatchStatus } from "@/lib/contracts";
import {
  isNumericMatchId,
  isValidTableCode,
  normalizeTableCode,
  resolveTableCode,
} from "@/lib/tableCode";

type MatchRow = {
  player1: Address;
  player2: Address;
  status: number;
  createdAt?: number | bigint;
};

function parseNumericId(raw: string): bigint | null {
  const t = raw.trim();
  if (!/^\d+$/.test(t)) return null;
  try {
    return BigInt(t);
  } catch {
    return null;
  }
}

function matchExists(m: MatchRow | undefined | null): boolean {
  if (!m) return false;
  if (m.status === MatchStatus.None) return false;
  if (!m.player1 || m.player1.toLowerCase() === zeroAddress) return false;
  return true;
}

function JoinInner() {
  const params = useSearchParams();
  const initial = params.get("matchId") || params.get("code") || "";
  const [rawInput, setRawInput] = useState(initial);
  const [resolvedMatchId, setResolvedMatchId] = useState<string | null>(
    isNumericMatchId(initial) ? initial.trim() : null
  );
  const [resolveState, setResolveState] = useState<
    "idle" | "loading" | "ok" | "missing" | "invalid"
  >(isNumericMatchId(initial) ? "ok" : initial ? "loading" : "idle");
  const [ticketId, setTicketId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { isConnected, address } = useAccount();
  const {
    stakeableTickets,
    loading,
    error: loadError,
    stakeableCount,
  } = useUserTickets();
  const escrowReady = useEscrowReady();
  const { joinMatch, isPending } = useEscrowActions();
  const router = useRouter();

  // Debounce resolve of table code / numeric id
  useEffect(() => {
    const raw = rawInput.trim();
    if (!raw) {
      setResolvedMatchId(null);
      setResolveState("idle");
      return;
    }

    if (isNumericMatchId(raw)) {
      setResolvedMatchId(raw.trim());
      setResolveState("ok");
      return;
    }

    const code = normalizeTableCode(raw);
    if (!isValidTableCode(code)) {
      setResolvedMatchId(null);
      setResolveState("invalid");
      return;
    }

    let cancelled = false;
    setResolveState("loading");
    const t = setTimeout(() => {
      void (async () => {
        try {
          const hit = await resolveTableCode(code);
          if (cancelled) return;
          if (!hit) {
            setResolvedMatchId(null);
            setResolveState("missing");
            return;
          }
          setResolvedMatchId(hit.matchId);
          setResolveState("ok");
        } catch {
          if (!cancelled) {
            setResolvedMatchId(null);
            setResolveState("missing");
          }
        }
      })();
    }, 320);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [rawInput]);

  const mid = useMemo(() => {
    if (!resolvedMatchId) return null;
    return parseNumericId(resolvedMatchId);
  }, [resolvedMatchId]);

  const { match, isLoading: matchLoading } = useMatch(mid);
  const m = match as MatchRow | undefined;

  const exists = matchExists(m);
  const canJoin = exists && m!.status === MatchStatus.Waiting;

  const statusMessage = useMemo(() => {
    if (!rawInput.trim()) return null;
    if (resolveState === "loading") return { kind: "muted" as const, text: "Looking up table code…" };
    if (resolveState === "invalid") {
      return {
        kind: "warn" as const,
        text: "Enter a match number (e.g. 12) or a table code (e.g. K7M2XP).",
      };
    }
    if (resolveState === "missing") {
      return {
        kind: "warn" as const,
        text: "No table found for that code.",
      };
    }
    if (resolveState !== "ok" || mid == null) return null;
    if (matchLoading && !m) {
      return { kind: "muted" as const, text: "Checking table on Base…" };
    }
    if (!exists) {
      return {
        kind: "warn" as const,
        text: `No open table with ID #${mid.toString()}. Double-check the number or code.`,
      };
    }
    if (m!.status === MatchStatus.Waiting) {
      return {
        kind: "ok" as const,
        text: `Host is ready · table #${mid.toString()}`,
      };
    }
    if (m!.status === MatchStatus.Active) {
      return {
        kind: "warn" as const,
        text: `Table #${mid.toString()} is already full / in progress.`,
      };
    }
    if (m!.status === MatchStatus.Resolved) {
      return {
        kind: "warn" as const,
        text: `Table #${mid.toString()} already finished.`,
      };
    }
    if (m!.status === MatchStatus.Cancelled) {
      return {
        kind: "warn" as const,
        text: `Table #${mid.toString()} was cancelled.`,
      };
    }
    return {
      kind: "warn" as const,
      text: `Table #${mid.toString()} cannot be joined.`,
    };
  }, [rawInput, resolveState, mid, matchLoading, m, exists]);

  const profile = address
    ? getProfile(address) || {
        username: defaultUsername(address),
        avatar: "🃏",
        color: "#c41e3a",
      }
    : null;

  const onJoin = async () => {
    setError(null);
    if (!address) {
      setError("Connect your wallet first.");
      return;
    }
    if (!mid || !canJoin) {
      setError("Enter a valid waiting table ID or code first.");
      return;
    }
    const ensured = ensureProfile(address);
    const name = sanitizeName(
      ensured.username || getSavedDisplayName() || defaultUsername(address)
    );
    if (!name) {
      setError("Could not resolve your username. Open profile in the nav.");
      return;
    }
    if (!ticketId) {
      setError("Tap a ticket below to stake it.");
      return;
    }
    const chosen = stakeableTickets.find(
      (t) => t.ticketId.toString() === ticketId
    );
    if (!chosen) {
      setError(
        "That ticket is from a draw that already finished. Buy a fresh Megapot ticket for the current round."
      );
      return;
    }
    saveDisplayName(name);
    setBusy(true);
    try {
      const idStr = mid.toString();
      await joinMatch(mid, BigInt(ticketId));
      rememberMatchId(idStr);
      setMatchPlayerName(idStr, "p2", name);
      router.push(`/play/match/${idStr}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Join failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="landing-premium ds">
      <SiteNav />
      <div className="app-shell shell-wide create-desk">
        <header className="header create-desk-header">
          <Link href="/play?view=friends" className="btn btn-ghost btn-sm">
            ← Play with Friends
          </Link>
          {profile && isConnected && (
            <div className="create-desk-you">
              <ProfileAvatar profile={profile} size={36} />
              <div>
                <strong>{profile.username}</strong>
                <span className="muted">Playing as</span>
              </div>
            </div>
          )}
        </header>

        <div className="create-desk-grid">
          <section className="card-panel stack create-desk-main">
            <h2>Join match</h2>
            <p className="muted">
              Stake your Megapot ticket against the host. Winner takes both.
            </p>

            <div className="ticket-badge">
              <div>
                <div className="muted">Open-draw tickets (stakeable)</div>
                <strong>{isConnected ? stakeableCount : "-"}</strong>
              </div>
            </div>
            <p className="muted" style={{ fontSize: "0.8rem" }}>
              Only current-round tickets can be staked. No-win tickets are hidden
              after you view draw results.
            </p>

            <label className="muted">Match ID or table code</label>
            <input
              className="input"
              value={rawInput}
              onChange={(e) => setRawInput(e.target.value)}
              placeholder="e.g. 12 or K7M2XP"
              autoCapitalize="characters"
              spellCheck={false}
            />

            {statusMessage && (
              <div
                className={
                  statusMessage.kind === "ok"
                    ? "pill join-status-ok"
                    : statusMessage.kind === "warn"
                      ? "alert"
                      : "muted"
                }
                style={
                  statusMessage.kind === "muted"
                    ? { fontSize: "0.85rem" }
                    : undefined
                }
              >
                {statusMessage.text}
              </div>
            )}

            {!isConnected ? (
              <p className="muted">Connect your wallet to see your tickets.</p>
            ) : (
              <TicketPicker
                tickets={stakeableTickets}
                loading={loading}
                error={loadError}
                selectedId={ticketId}
                onSelect={setTicketId}
              />
            )}
          </section>

          <aside className="card-panel stack create-desk-side">
            <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 800 }}>
              Confirm join
            </h3>
            <p className="muted" style={{ fontSize: "0.85rem", margin: 0 }}>
              Your profile username is used at the table. Creating a table
              instead?{" "}
              <Link href="/play/create" style={{ textDecoration: "underline" }}>
                Generate your own ID
              </Link>
              .
            </p>
            <button
              type="button"
              className="btn btn-primary"
              disabled={
                !isConnected ||
                !escrowReady ||
                !ticketId ||
                !canJoin ||
                busy ||
                isPending
              }
              onClick={onJoin}
            >
              {busy ? "Confirm…" : "Stake & join"}
            </button>
            {error && <div className="alert">{error}</div>}
          </aside>
        </div>
      </div>
    </div>
  );
}

export default function JoinPage() {
  return (
    <Suspense
      fallback={
        <div className="landing-premium ds">
          <div className="app-shell">Loading…</div>
        </div>
      }
    >
      <JoinInner />
    </Suspense>
  );
}
