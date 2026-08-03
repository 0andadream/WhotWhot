"use client";

import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { SiteNav } from "@/components/SiteNav";
import { TicketPicker } from "@/components/TicketPicker";
import { NameField } from "@/components/NameField";
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

function JoinInner() {
  const params = useSearchParams();
  const initial = params.get("matchId") || "";
  const [matchId, setMatchId] = useState(initial);
  const [ticketId, setTicketId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { isConnected } = useAccount();
  const { tickets, loading, error: loadError, count } = useUserTickets();
  const escrowReady = useEscrowReady();
  const { joinMatch, isPending } = useEscrowActions();
  const router = useRouter();
  const mid = matchId.trim() ? BigInt(matchId.trim()) : null;
  const { match } = useMatch(mid);

  useEffect(() => {
    setDisplayName(getSavedDisplayName());
  }, []);

  const onJoin = async () => {
    setError(null);
    const name = sanitizeName(displayName || getSavedDisplayName());
    if (!name) {
      setError("Enter a name so your opponent knows who you are.");
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
    <div className="ds">
      <SiteNav />
      <div className="app-shell shell-wide">
      <header className="header">
        <Link href="/play" className="btn btn-ghost btn-sm">
          ← Play
        </Link>
      </header>

      <div className="card-panel stack panel-narrow">
        <h2>Join match</h2>
        <p className="muted">
          Stake your Megapot ticket against the host. Winner takes both.
        </p>

        <NameField value={displayName} onChange={setDisplayName} />

        <div className="ticket-badge">
          <div>
            <div className="muted">You have</div>
            <strong>{isConnected ? count : "—"}</strong>
            <span className="muted"> tickets</span>
          </div>
        </div>

        <label className="muted">Match ID</label>
        <input
          className="input"
          value={matchId}
          onChange={(e) => setMatchId(e.target.value)}
          placeholder="1"
        />

        {match && (
          <div className="pill">
            Host is ready · table #{matchId || "—"}
          </div>
        )}

        {!isConnected ? (
          <p className="muted">Connect your wallet to see your tickets.</p>
        ) : (
          <TicketPicker
            tickets={tickets}
            loading={loading}
            error={loadError}
            selectedId={ticketId}
            onSelect={setTicketId}
          />
        )}

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
      </div>
      </div>
    </div>
  );
}

export default function JoinPage() {
  return (
    <Suspense
      fallback={
        <div className="ds">
          <div className="app-shell">Loading…</div>
        </div>
      }
    >
      <JoinInner />
    </Suspense>
  );
}
