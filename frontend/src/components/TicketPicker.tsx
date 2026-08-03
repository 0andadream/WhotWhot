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
  /** Prefer stakeableTickets from useUserTickets */
  tickets: OwnedTicket[];
  loading?: boolean;
  error?: string | null;
  selectedId: string;
  onSelect: (ticketId: string) => void;
  emptyHint?: string;
}

/**
 * Tap-to-select list of stakeable Megapot tickets only.
 * Drawn / results-seen NFTs are not listed (see match tickets page for history).
 */
export function TicketPicker({
  tickets,
  loading,
  error,
  selectedId,
  onSelect,
  emptyHint,
}: Props) {
  if (loading) {
    return <p className="muted">Loading your tickets…</p>;
  }

  if (error) {
    return <div className="alert">{error}</div>;
  }

  const stakeable = tickets.filter((t) => t.stakeable && !t.resultsSeen);

  if (stakeable.length === 0) {
    return (
      <p className="muted">
        {emptyHint ||
          "No open-draw tickets to stake. Buy a fresh Megapot ticket for the current round. Already-drawn NFTs (including no-win tickets after you view results) are hidden."}
      </p>
    );
  }

  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="muted" style={{ fontSize: "0.8rem" }}>
        Tap a ticket for the <strong>current open draw</strong> (
        {stakeable.length} available)
      </div>
      <div className="ticket-pick-list">
        {stakeable.map((t) => {
          const id = t.ticketId.toString();
          const selected = selectedId === id;
          return (
            <button
              key={id}
              type="button"
              className={`ticket-pick${selected ? " selected" : ""}`}
              onClick={() => onSelect(id)}
              aria-pressed={selected}
            >
              <div className="ticket-pick-main">
                <span className="ticket-pick-label">Open draw</span>
                <span className="ticket-pick-id">{shortId(t.ticketId)}</span>
              </div>
              <div className="ticket-pick-meta">
                <span>{formatNumbers(t)}</span>
                <span className="muted">Round {t.drawingId.toString()}</span>
              </div>
              {selected && <span className="ticket-pick-check">Selected</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
