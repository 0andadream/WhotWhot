"use client";

import { useCallback, useEffect, useState } from "react";
import type { Address } from "viem";
import { MatchStatus } from "@/lib/contracts";
import { formatUsdc, shortAddr, shortTicketId } from "@/lib/megapotTicket";
import { markDrawnTicketsSeen } from "@/lib/seenDrawnTickets";
import {
  useClaimWinnings,
  useMatchTickets,
  type MatchTicketRow,
} from "@/hooks/useMatchTickets";

type MatchShape = {
  ticket1: bigint;
  ticket2: bigint;
  player1: Address;
  player2: Address;
  status: number;
  startedAt?: number | bigint;
  player1Result?: Address;
  player2Result?: Address;
};

const RESULT_TIMEOUT_SEC = 2 * 60 * 60;

function Balls({
  normals,
  bonus,
  matched,
  bonusHit,
}: {
  normals: number[];
  bonus: number;
  matched?: number[];
  bonusHit?: boolean;
}) {
  const hit = new Set((matched || []).map(Number));
  return (
    <div className="ticket-balls" aria-label="Ticket numbers">
      {normals.map((n) => (
        <span
          key={`n-${n}`}
          className={`ball ${hit.has(n) ? "ball-hit" : ""}`}
        >
          {n}
        </span>
      ))}
      <span className={`ball ball-bonus ${bonusHit ? "ball-hit" : ""}`}>
        +{bonus}
      </span>
    </div>
  );
}

function TicketCard({
  row,
  label,
  youAreStaker,
}: {
  row: MatchTicketRow;
  label: string;
  youAreStaker: boolean;
}) {
  const ownerLabel = row.ownedByEscrow
    ? "Locked in escrow"
    : row.ownedByYou
      ? "In your wallet"
      : row.owner
        ? `Owner ${shortAddr(row.owner)}`
        : "Owner unknown";

  let resultLine: string;
  if (!row.drawn) {
    resultLine = row.drawingTime
      ? `Draw #${row.drawingId.toString()} · ${new Date(row.drawingTime * 1000).toLocaleString()} (not settled yet)`
      : `Draw #${row.drawingId.toString()} · pending`;
  } else if (row.score) {
    const hit =
      row.score.matchCount === 0 && !row.score.bonusHit
        ? "no matches"
        : `${row.score.matchCount} normal${row.score.matchCount === 1 ? "" : "s"}${row.score.bonusHit ? " + bonus" : ""}`;
    resultLine = `Draw #${row.drawingId.toString()} settled · ${hit}`;
  } else {
    resultLine = `Draw #${row.drawingId.toString()} settled`;
  }

  return (
    <div className={`ticket-result-card ${row.prize.hasPrize ? "has-prize" : ""}`}>
      <div className="ticket-result-head">
        <strong>
          {label}
          {youAreStaker ? " (yours)" : ""}
        </strong>
        <span className="muted" style={{ fontSize: "0.75rem" }}>
          NFT {shortTicketId(row.ticketId)}
        </span>
      </div>
      <Balls
        normals={row.normals}
        bonus={row.bonusball}
        matched={row.score?.matchedNormals}
        bonusHit={row.score?.bonusHit}
      />
      {row.drawn && row.winNormals.length > 0 && (
        <p className="muted" style={{ fontSize: "0.75rem", marginTop: 8 }}>
          Winning:{" "}
          <strong style={{ color: "var(--text)" }}>
            {row.winNormals.join(" · ")} +{row.winBonus}
          </strong>
        </p>
      )}
      <p className="muted" style={{ fontSize: "0.8rem", marginTop: 6 }}>
        {resultLine}
      </p>
      <p style={{ marginTop: 6, fontWeight: 600 }}>
        {row.drawn ? (
          <span
            className={
              row.prize.hasPrize ? "prize-yes" : "prize-no"
            }
          >
            {row.prize.text}
            {row.prize.hasPrize && row.prize.kind === "cash"
              ? " USDC"
              : ""}
          </span>
        ) : (
          <span className="muted">Awaiting draw</span>
        )}
      </p>
      <p className="muted" style={{ fontSize: "0.75rem", marginTop: 4 }}>
        {ownerLabel}
        {row.prize.hasPrize && row.ownedByEscrow && (
          <> · claim after tickets return to a wallet</>
        )}
        {row.prize.hasPrize &&
          !row.ownedByYou &&
          !row.ownedByEscrow &&
          row.owner && <> · only the NFT owner can claim</>}
      </p>
    </div>
  );
}

export function MatchTicketsPanel({
  match,
  matchId,
  address,
  p1Name,
  p2Name,
  onCancelActive,
  cancelPending,
}: {
  match: MatchShape;
  matchId: bigint;
  address?: Address;
  p1Name: string;
  p2Name: string;
  onCancelActive?: () => Promise<void>;
  cancelPending?: boolean;
}) {
  const tickets = useMatchTickets(match);
  const { claim, isPending, confirming, isSuccess, error, reset } =
    useClaimWinnings();
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isSuccess) {
      setMsg("Claim confirmed. USDC should appear in your wallet.");
      void tickets.refetch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess]);

  /**
   * After the user opens this page and sees a no-win on a settled draw,
   * hide that NFT from stake pickers and ticket counts (not a fresh bet).
   * This panel still shows the result for the match.
   */
  useEffect(() => {
    if (!tickets.rows.length || tickets.loading) return;
    const toHide = tickets.rows
      .filter((row) => row.drawn && !row.prize.hasPrize)
      .map((row) => row.ticketId);
    if (!toHide.length) return;
    markDrawnTicketsSeen(toHide);
  }, [tickets.rows, tickets.loading]);

  const me = address?.toLowerCase();
  const isPlayer =
    !!me &&
    (match.player1.toLowerCase() === me || match.player2.toLowerCase() === me);

  const startedAt = match.startedAt != null ? Number(match.startedAt) : 0;
  const cancelEligible =
    match.status === MatchStatus.Active &&
    startedAt > 0 &&
    Math.floor(Date.now() / 1000) - startedAt >= RESULT_TIMEOUT_SEC &&
    isPlayer;

  const onClaim = useCallback(
    async (ids: bigint[]) => {
      setMsg(null);
      reset();
      try {
        await claim(ids);
        setMsg("Claim submitted. USDC (or free-ticket value) pays to your wallet.");
        await tickets.refetch();
      } catch (e: unknown) {
        const raw = e instanceof Error ? e.message : "Claim failed";
        if (/NoTicketsToClaim|no tickets/i.test(raw)) {
          setMsg("Nothing left to claim (already claimed or $0 payout).");
        } else if (/NotTicketOwner/i.test(raw)) {
          setMsg("You must own the ticket NFT to claim. Finish or cancel the match first.");
        } else {
          setMsg(raw);
        }
      }
    },
    [claim, reset, tickets]
  );

  const claimable = tickets.claimableIds;

  return (
    <div className="card-panel match-tickets-panel" style={{ marginTop: 12 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <h2 style={{ margin: 0, fontSize: "1.15rem" }}>Tickets &amp; draw results</h2>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={tickets.loading}
          onClick={() => void tickets.refetch()}
        >
          {tickets.loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {tickets.error && (
        <div className="alert" style={{ marginTop: 12 }}>
          {tickets.error}
        </div>
      )}

      {tickets.loading && tickets.rows.length === 0 && (
        <p className="muted" style={{ marginTop: 12 }}>
          Loading ticket numbers…
        </p>
      )}

      <div className="ticket-result-grid" style={{ marginTop: 12 }}>
        {tickets.rows.map((row) => (
          <TicketCard
            key={row.slot}
            row={row}
            label={row.slot === "ticket1" ? p1Name : p2Name}
            youAreStaker={
              !!me && row.staker.toLowerCase() === me
            }
          />
        ))}
      </div>

      {tickets.anyPrize && tickets.lockedInEscrow && (
        <div className="banner" style={{ marginTop: 12 }}>
          A prize is tied to a ticket still in escrow. Finish the Whot match
          (both confirm winner) or cancel after 2h so the NFT returns to a
          wallet, then claim here.
        </div>
      )}

      {match.status === MatchStatus.Resolved && (
        <div className="banner win" style={{ marginTop: 12 }}>
          Whot settled: both ticket NFTs went to the winner. If either has a
          Megapot prize, the winner claims USDC below.
        </div>
      )}

      {match.status === MatchStatus.Cancelled && (
        <div className="banner" style={{ marginTop: 12 }}>
          Match cancelled. Tickets returned to original stakers. Claim any
          Megapot prizes from your wallet.
        </div>
      )}

      {claimable.length > 0 && (
        <div style={{ marginTop: 14, display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button
            type="button"
            className="btn btn-primary"
            disabled={isPending || confirming}
            onClick={() => void onClaim(claimable)}
          >
            {isPending || confirming
              ? "Claiming…"
              : claimable.length === 1
                ? `Claim prize (${formatUsdc(
                    tickets.rows.find((r) => r.ticketId === claimable[0])
                      ?.payoutUsdc ?? 0n
                  )})`
                : `Claim all prizes (${claimable.length} tickets)`}
          </button>
          {claimable.length > 1 &&
            claimable.map((id) => {
              const row = tickets.rows.find((r) => r.ticketId === id);
              if (!row) return null;
              return (
                <button
                  key={id.toString()}
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={isPending || confirming}
                  onClick={() => void onClaim([id])}
                >
                  Claim {shortTicketId(id)} · {row.prize.text}
                </button>
              );
            })}
        </div>
      )}

      {isSuccess && !msg && (
        <p className="muted" style={{ marginTop: 8, color: "var(--green-text)" }}>
          Claim transaction confirmed.
        </p>
      )}
      {(msg || error) && (
        <div className="alert" style={{ marginTop: 10 }}>
          {msg || (error instanceof Error ? error.message : String(error))}
        </div>
      )}

      {cancelEligible && onCancelActive && (
        <div style={{ marginTop: 14 }}>
          <p className="muted" style={{ fontSize: "0.85rem", marginBottom: 8 }}>
            Match stuck over 2 hours with no dual confirm. Either player can
            cancel and get their own ticket back.
          </p>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={cancelPending}
            onClick={() => void onCancelActive()}
          >
            {cancelPending
              ? "Cancelling…"
              : `Cancel match #${matchId.toString()} (return tickets)`}
          </button>
        </div>
      )}

      {isPlayer &&
        match.status === MatchStatus.Active &&
        !cancelEligible &&
        startedAt > 0 && (
          <p className="muted" style={{ marginTop: 12, fontSize: "0.8rem" }}>
            Cancel available{" "}
            {new Date((startedAt + RESULT_TIMEOUT_SEC) * 1000).toLocaleString()}{" "}
            if the match never dual-confirms.
          </p>
        )}
    </div>
  );
}
