"use client";

import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense, useState } from "react";
import { SiteNav } from "@/components/SiteNav";
import { TicketPicker } from "@/components/TicketPicker";
import { ProfileAvatar } from "@/components/ProfileAvatar";
import { useAccount } from "wagmi";
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

function JoinInner() {
  const params = useSearchParams();
  const initial = params.get("matchId") || "";
  const [matchId, setMatchId] = useState(initial);
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
  const mid = matchId.trim() ? BigInt(matchId.trim()) : null;
  const { match } = useMatch(mid);

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
    const ensured = ensureProfile(address);
    const name = sanitizeName(
      ensured.username || getSavedDisplayName() || defaultUsername(address)
    );
    if (!name) {
      setError("Could not resolve your username. Open profile in the nav.");
      return;
    }
    if (!matchId.trim()) {
      setError("Enter a match ID.");
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
      await joinMatch(BigInt(matchId.trim()), BigInt(ticketId));
      rememberMatchId(matchId.trim());
      setMatchPlayerName(matchId.trim(), "p2", name);
      router.push(`/play/match/${matchId.trim()}`);
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
          <Link href="/play" className="btn btn-ghost btn-sm">
            ← Play
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

            <label className="muted">Match ID</label>
            <input
              className="input"
              value={matchId}
              onChange={(e) => setMatchId(e.target.value)}
              placeholder="1"
            />

            {match && (
              <div className="pill">
                Host is ready · table #{matchId || "-"}
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
              Your profile username is used at the table — no need to re-enter a
              name.
            </p>
            <button
              type="button"
              className="btn btn-primary"
              disabled={
                !isConnected ||
                !escrowReady ||
                !ticketId ||
                !matchId.trim() ||
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
