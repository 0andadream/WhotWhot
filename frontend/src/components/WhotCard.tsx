"use client";

import { SuitIcon } from "./SuitIcon";
import type { Card } from "@/lib/whot/types";

const SPECIAL_LABEL: Record<string, string> = {
  hold_on: "Hold On",
  pick_two: "Pick 2",
  pick_three: "Pick 3",
  suspension: "Skip",
  general_market: "Market",
  whot: "WHOT",
};

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
        className={`whot-card back${small ? " sm" : ""}`}
        aria-hidden
        style={
          small
            ? undefined
            : undefined
        }
      />
    );
  }

  const isWhot = card.special === "whot";
  const shapeClass = isWhot ? "whot-wild" : `shape-${card.shape}`;
  const cls = [
    "whot-card",
    shapeClass,
    playable ? "playable" : "",
    selected ? "selected" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const tag = card.special ? SPECIAL_LABEL[card.special] : null;

  const inner = (
    <>
      <span className="corner">
        <span className="n">{isWhot ? "20" : card.number}</span>
        {!isWhot && (
          <span className="s">
            <SuitIcon shape={card.shape} size={14} />
          </span>
        )}
      </span>
      <span className="center-shape">
        {isWhot ? "WHOT" : <SuitIcon shape={card.shape} size={small ? 28 : 44} />}
      </span>
      {tag && !isWhot && <span className="special-tag">{tag}</span>}
      {isWhot && <span className="special-tag">Call shape</span>}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        className={cls}
        onClick={onClick}
        aria-label={`${card.shape} ${card.number}${tag ? ` ${tag}` : ""}`}
      >
        {inner}
      </button>
    );
  }

  return (
    <div className={cls} aria-label={`${card.shape} ${card.number}`}>
      {inner}
    </div>
  );
}
