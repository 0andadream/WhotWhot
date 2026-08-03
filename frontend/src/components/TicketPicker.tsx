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
  tickets: OwnedTicket[];
  loading?: boolean;
  error?: string | null;
  selectedId: string;
  onSelect: (ticketId: string) => void;
  emptyHint?: string;
}

/**
 * Simple tap-to-select list of owned Megapot tickets (no NFT image gallery).
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

  if (tickets.length === 0) {
    return (
      <p className="muted">
        {emptyHint ||
          "No tickets found in this wallet. Buy one from the Play lobby first."}
      </p>
    );
  }

  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="muted" style={{ fontSize: "0.8rem" }}>
        Tap a ticket to stake it ({tickets.length} found)
      </div>
      <div className="ticket-pick-list">
        {tickets.map((t) => {
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
                <span className="ticket-pick-label">Ticket</span>
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
