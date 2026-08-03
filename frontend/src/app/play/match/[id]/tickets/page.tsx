"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAccount } from "wagmi";
import type { Address } from "viem";
import { SiteNav } from "@/components/SiteNav";
import { MatchTicketsPanel } from "@/components/MatchTicketsPanel";
import { useEscrowActions, useMatch } from "@/hooks/useEscrow";
import { MatchStatus } from "@/lib/contracts";
import {
  getMatchNames,
  getSavedDisplayName,
  setMatchPlayerName,
} from "@/lib/displayName";

/**
 * Separate from the live board so ticket RPC / claim UI never blocks gameplay.
 * Route: /play/match/[id]/tickets
 */
export default function MatchTicketsPage() {
  const params = useParams();
  const matchId = useMemo(() => {
    try {
      return BigInt(String(params.id));
    } catch {
      return null;
    }
  }, [params.id]);

  const matchKey = matchId != null ? matchId.toString() : "";
  const { address } = useAccount();
  const { match, refetch, isLoading } = useMatch(matchId);
  const { cancelActive, isPending } = useEscrowActions();
  const [msg, setMsg] = useState<string | null>(null);
  const [p1Name, setP1Name] = useState("Host");
  const [p2Name, setP2Name] = useState("Opponent");

  const humanPlayer = useMemo(() => {
    if (!match || !address) return null;
    if (match.player1.toLowerCase() === address.toLowerCase()) return "p1";
    if (match.player2.toLowerCase() === address.toLowerCase()) return "p2";
    return null;
  }, [match, address]);

  useEffect(() => {
    if (!match || !matchKey) return;
    const stored = getMatchNames(matchKey);
    const mine = getSavedDisplayName();
    let n1 = stored.p1 || "Host";
    let n2 = stored.p2 || "Opponent";
    if (humanPlayer === "p1") {
      n1 = mine || "You";
      if (mine) setMatchPlayerName(matchKey, "p1", mine);
      if (!stored.p2) n2 = "Opponent";
    }
    if (humanPlayer === "p2") {
      n2 = mine || "You";
      if (mine) setMatchPlayerName(matchKey, "p2", mine);
      if (!stored.p1) n1 = "Host";
    }
    setP1Name(n1);
    setP2Name(n2);
  }, [match, matchKey, humanPlayer]);

  const onCancelActive = useCallback(async () => {
    if (!matchId) return;
    try {
      setMsg(
        "Confirm cancel in wallet. Both tickets return to original stakers."
      );
      await cancelActive(matchId);
      setMsg(
        "Match cancelled. Tickets returned. Claim any Megapot prizes below if you own a winning NFT."
      );
      refetch();
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : "Cancel failed");
    }
  }, [matchId, cancelActive, refetch]);

  if (matchId == null) {
    return (
      <div className="landing-premium ds">
        <SiteNav />
        <div className="app-shell shell-wide">
          <div className="alert">Invalid match id</div>
        </div>
      </div>
    );
  }

  const boardHref = `/play/match/${matchId.toString()}`;

  return (
    <div className="landing-premium ds">
      <SiteNav />
      <div className="app-shell shell-wide">
        <header className="header">
          <Link href={boardHref} className="btn btn-ghost btn-sm">
            ← Back to board
          </Link>
          <Link href="/play" className="btn btn-ghost btn-sm">
            Play lobby
          </Link>
        </header>

        <div className="card-panel" style={{ marginBottom: 4 }}>
          <h2 style={{ margin: 0 }}>Tickets &amp; draw results</h2>
          <p className="muted" style={{ marginTop: 8 }}>
            Table #{matchId.toString()}
            {match
              ? ` · ${
                  match.status === MatchStatus.Active
                    ? "In progress"
                    : match.status === MatchStatus.Resolved
                      ? "Resolved"
                      : match.status === MatchStatus.Cancelled
                        ? "Cancelled"
                        : match.status === MatchStatus.Waiting
                          ? "Waiting"
                          : "Match"
                }`
              : isLoading
                ? " · Loading…"
                : ""}
          </p>
          <p className="muted" style={{ marginTop: 6, fontSize: "0.85rem" }}>
            Megapot lottery only. This page is separate from the Whot board so
            draw checks never slow down card play.
          </p>
          <div style={{ marginTop: 12 }}>
            <Link href={boardHref} className="btn btn-primary btn-sm">
              Open Whot board
            </Link>
          </div>
        </div>

        {msg && <div className="alert">{msg}</div>}

        {!match && isLoading && (
          <p className="muted" style={{ marginTop: 16 }}>
            Loading match…
          </p>
        )}

        {match && (match.ticket1 > 0n || match.ticket2 > 0n) && (
          <MatchTicketsPanel
            match={{
              ticket1: match.ticket1,
              ticket2: match.ticket2,
              player1: match.player1 as Address,
              player2: match.player2 as Address,
              status: match.status,
              startedAt: match.startedAt,
              player1Result: match.player1Result as Address | undefined,
              player2Result: match.player2Result as Address | undefined,
            }}
            matchId={matchId}
            address={address}
            p1Name={p1Name}
            p2Name={p2Name}
            onCancelActive={onCancelActive}
            cancelPending={isPending}
          />
        )}

        {match && match.ticket1 === 0n && match.ticket2 === 0n && (
          <p className="muted" style={{ marginTop: 16 }}>
            No tickets staked on this match yet.
          </p>
        )}
      </div>
    </div>
  );
}
