"use client";

import type { OwnedTicket } from "@/hooks/useUserTickets";

function shortId(id: bigint) {
  const s = id.toString();
  if (s.length <= 10) return s;
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

function formatNumbers(t: OwnedTicket) {
  if (!t.normals?.length) return "Megapot ticket";
  const nums = t.normals.join(" · ");
  return `${nums} + ${t.bonusball}`;
}

interface Props {
  /** All owned tickets (stakeable + spent). Spent are listed disabled. */
  tickets: OwnedTicket[];
  loading?: boolean;
  error?: string | null;
  selectedId: string;
  onSelect: (ticketId: string) => void;
  emptyHint?: string;
  /** If set, only these can be selected (defaults to stakeable) */
  stakeableOnly?: boolean;
}

/**
 * Tap-to-select list of owned Megapot tickets.
 * Already-drawn NFTs cannot be selected (prevents staking spent lottery tickets).
 */
export function TicketPicker({
  tickets,
  loading,
  error,
  selectedId,
  onSelect,
  emptyHint,
  stakeableOnly = true,
}: Props) {
  if (loading) {
    return <p className="muted">Loading your tickets…</p>;
  }

  if (error) {
    return <div className="alert">{error}</div>;
  }

  const stakeable = tickets.filter((t) => t.stakeable);
  const spent = tickets.filter((t) => t.drawn);
  const list = stakeableOnly ? stakeable : tickets;

  if (tickets.length === 0) {
    return (
      <p className="muted">
        {emptyHint ||
          "No tickets found in this wallet. Buy one from the Play lobby first."}
      </p>
    );
  }

  if (stakeableOnly && stakeable.length === 0) {
    return (
      <div className="stack" style={{ gap: 10 }}>
        <div className="alert">
          You have {spent.length} ticket{spent.length === 1 ? "" : "s"}, but{" "}
          {spent.length === 1 ? "it is" : "they are"} from a{" "}
          <strong>draw that already finished</strong>. You cannot stake a spent
          Megapot NFT. Buy a fresh ticket for the current round.
        </div>
        {spent.length > 0 && (
          <div className="ticket-pick-list ticket-pick-list-spent">
            {spent.map((t) => (
              <div
                key={t.ticketId.toString()}
                className="ticket-pick ticket-pick-disabled"
                aria-disabled="true"
              >
                <div className="ticket-pick-main">
                  <span className="ticket-pick-label">Drawn · cannot stake</span>
                  <span className="ticket-pick-id">{shortId(t.ticketId)}</span>
                </div>
                <div className="ticket-pick-meta">
                  <span>{formatNumbers(t)}</span>
                  <span className="muted">
                    Round {t.drawingId.toString()} (settled)
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="muted" style={{ fontSize: "0.8rem" }}>
        Tap a ticket for the <strong>current open draw</strong> (
        {stakeable.length} stakeable
        {spent.length > 0 ? ` · ${spent.length} already drawn` : ""})
      </div>
      <div className="ticket-pick-list">
        {list.map((t) => {
          const id = t.ticketId.toString();
          const selected = selectedId === id;
          const canSelect = t.stakeable;
          return (
            <button
              key={id}
              type="button"
              className={`ticket-pick${selected ? " selected" : ""}${
                !canSelect ? " ticket-pick-disabled" : ""
              }`}
              onClick={() => {
                if (canSelect) onSelect(id);
              }}
              disabled={!canSelect}
              aria-pressed={selected}
              aria-disabled={!canSelect}
            >
              <div className="ticket-pick-main">
                <span className="ticket-pick-label">
                  {canSelect ? "Open draw" : "Drawn · cannot stake"}
                </span>
                <span className="ticket-pick-id">{shortId(t.ticketId)}</span>
              </div>
              <div className="ticket-pick-meta">
                <span>{formatNumbers(t)}</span>
                <span className="muted">
                  Round {t.drawingId.toString()}
                  {t.drawn ? " (settled)" : ""}
                </span>
              </div>
              {selected && canSelect && (
                <span className="ticket-pick-check">Selected</span>
              )}
            </button>
          );
        })}
      </div>
      {stakeableOnly && spent.length > 0 && (
        <p className="muted" style={{ fontSize: "0.75rem" }}>
          {spent.length} already-drawn ticket
          {spent.length === 1 ? "" : "s"} hidden from stake list (round settled).
          Winning NFTs burn on claim; losing NFTs stay in your wallet but are not
          valid for a new Whot stake.
        </p>
      )}
    </div>
  );
}
