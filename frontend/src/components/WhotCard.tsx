"use client";

import { SHAPE_SYMBOL } from "@/lib/whot/deck";
import type { Card } from "@/lib/whot/types";

interface Props {
  card?: Card;
  faceDown?: boolean;
  playable?: boolean;
  selected?: boolean;
  onClick?: () => void;
  small?: boolean;
}

export function WhotCard({
  card,
  faceDown,
  playable,
  selected,
  onClick,
  small,
}: Props) {
  if (faceDown || !card) {
    return (
      <div
        className="whot-card back"
        style={small ? { width: 48, height: 68, fontSize: "0.6rem" } : undefined}
        aria-hidden
      >
        WHOT
      </div>
    );
  }

  const isWhot = card.special === "whot";
  const cls = [
    "whot-card",
    isWhot ? "whot-wild" : "",
    playable ? "playable" : "",
    selected ? "selected" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type="button"
      className={cls}
      onClick={onClick}
      disabled={!onClick}
      aria-label={`${card.shape} ${card.number}`}
    >
      <span className="corner">
        {isWhot ? "W" : card.number}
        {!isWhot && SHAPE_SYMBOL[card.shape]}
      </span>
      <span className="shape">{isWhot ? "WHOT" : SHAPE_SYMBOL[card.shape]}</span>
      <span className="num">{isWhot ? "20" : card.number}</span>
    </button>
  );
}
