"use client";

import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense, useState } from "react";
import { ConnectButton } from "@/components/ConnectButton";
import { useAccount } from "wagmi";
import { useEscrowActions, useEscrowReady, useMatch } from "@/hooks/useEscrow";
import { useTicketCount } from "@/hooks/useMegapot";

function JoinInner() {
  const params = useSearchParams();
  const initial = params.get("matchId") || "";
  const [matchId, setMatchId] = useState(initial);
  const [ticketId, setTicketId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { isConnected } = useAccount();
  const { count } = useTicketCount();
  const escrowReady = useEscrowReady();
  const { joinMatch, isPending } = useEscrowActions();
  const router = useRouter();
  const mid = matchId.trim() ? BigInt(matchId.trim()) : null;
  const { match } = useMatch(mid);

  const onJoin = async () => {
    setError(null);
    if (!matchId.trim() || !ticketId.trim()) {
      setError("Match ID and ticket ID required.");
      return;
    }
    setBusy(true);
    try {
      await joinMatch(BigInt(matchId.trim()), BigInt(ticketId.trim()));
      router.push(`/play/match/${matchId.trim()}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Join failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="app-shell">
      <header className="header">
        <Link href="/" className="btn btn-ghost connect-btn">
          ← Back
        </Link>
        <ConnectButton />
      </header>

      <div className="card-panel stack">
        <h2>Join match</h2>
        <p className="muted">
          Stake your Megapot ticket against the host. Winner takes both.
        </p>

        <div className="ticket-badge">
          <div>
            <div className="muted">You have</div>
            <strong>{isConnected ? (count ?? "…") : "—"}</strong>
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
            Host: {match.player1.slice(0, 6)}…{match.player1.slice(-4)} · ticket #
            {match.ticket1.toString()} · status {match.status}
          </div>
        )}

        <label className="muted">Your ticket token ID</label>
        <input
          className="input"
          value={ticketId}
          onChange={(e) => setTicketId(e.target.value)}
          placeholder="Token id to stake"
        />

        <button
          type="button"
          className="btn btn-primary"
          disabled={!isConnected || !escrowReady || busy || isPending}
          onClick={onJoin}
        >
          {busy ? "Confirm…" : "Stake & join"}
        </button>
        {error && <div className="alert">{error}</div>}
      </div>
    </div>
  );
}

export default function JoinPage() {
  return (
    <Suspense fallback={<div className="app-shell">Loading…</div>}>
      <JoinInner />
    </Suspense>
  );
}
