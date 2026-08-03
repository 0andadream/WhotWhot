"use client";

import { SuitIcon } from "./SuitIcon";
import type { Card } from "@/lib/whot/types";

interface Props {
  card?: Card;
  faceDown?: boolean;
  playable?: boolean;
  selected?: boolean;
  onClick?: () => void;
  small?: boolean;
}

/**
 * Classic Nigerian Whot card: cream face, bold red number + shape,
 * dual corner indices, deep red back with WHOT wordmark.
 */
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
        className={`whot-card classic back${small ? " sm" : ""}`}
        aria-hidden
      />
    );
  }

  const isWhot = card.special === "whot";
  const cls = [
    "whot-card",
    "classic",
    isWhot ? "whot-wild" : "",
    playable ? "playable" : "",
    selected ? "selected" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const num = isWhot ? 20 : card.number;
  const shapeSize = small ? 26 : 48;
  const cornerSize = small ? 11 : 16;

  const inner = (
    <>
      <div className="idx top">
        <span className="n">{num}</span>
        {!isWhot && <SuitIcon shape={card.shape} size={cornerSize} />}
        {isWhot && <span className="w-mini">W</span>}
      </div>

      <div className="face-center">
        {isWhot ? (
          <div className="whot-mark">
            <span className="whot-word">WHOT</span>
            <span className="whot-num">20</span>
          </div>
        ) : (
          <SuitIcon shape={card.shape} size={shapeSize} />
        )}
      </div>

      <div className="idx bottom">
        <span className="n">{num}</span>
        {!isWhot && <SuitIcon shape={card.shape} size={cornerSize} />}
        {isWhot && <span className="w-mini">W</span>}
      </div>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        className={cls}
        onClick={onClick}
        aria-label={`${card.shape} ${num}`}
      >
        {inner}
      </button>
    );
  }

  return (
    <div className={cls} aria-label={`${card.shape} ${num}`}>
      {inner}
    </div>
  );
}
