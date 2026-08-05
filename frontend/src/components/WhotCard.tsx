"use client";

import { SuitIcon } from "./SuitIcon";
import type { Card, SpecialKind } from "@/lib/whot/types";

interface Props {
  card?: Card;
  faceDown?: boolean;
  playable?: boolean;
  selected?: boolean;
  onClick?: () => void;
  small?: boolean;
  /** Show special-card ribbon (Hold On, Pick Two, …) */
  showSpecial?: boolean;
}

const SPECIAL_BADGE: Partial<Record<NonNullable<SpecialKind>, string>> = {
  hold_on: "HOLD ON",
  pick_two: "PICK 2",
  pick_three: "PICK 3",
  suspension: "SKIP",
  general_market: "MARKET",
  whot: "WHOT",
};

/**
 * Classic Nigerian Whot card:
 * cream/off-white face · bold red geometry · large clear numbers ·
 * deep red back with elegant white “Whot” lettering.
 */
export function WhotCard({
  card,
  faceDown,
  playable,
  selected,
  onClick,
  small,
  showSpecial = true,
}: Props) {
  if (faceDown || !card) {
    return (
      <div
        className={`whot-card classic back${small ? " sm" : ""}`}
        aria-hidden
      >
        <span className="whot-back-mark" aria-hidden>
          Whot
        </span>
      </div>
    );
  }

  const isWhot = card.special === "whot";
  const special = card.special;
  const badge =
    showSpecial && special && special !== "whot"
      ? SPECIAL_BADGE[special]
      : null;

  const cls = [
    "whot-card",
    "classic",
    isWhot ? "whot-wild" : "",
    special && special !== "whot" ? `special-${special.replace(/_/g, "-")}` : "",
    playable ? "playable" : "",
    selected ? "selected" : "",
    small ? "sm" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const num = isWhot ? 20 : card.number;
  const shapeSize = small ? 30 : 56;
  const cornerSize = small ? 13 : 20;

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

      {badge && <span className="whot-special-badge">{badge}</span>}

      <div className="idx bottom">
        <span className="n">{num}</span>
        {!isWhot && <SuitIcon shape={card.shape} size={cornerSize} />}
        {isWhot && <span className="w-mini">W</span>}
      </div>
    </>
  );

  const label = isWhot
    ? "Whot 20"
    : `${card.shape} ${num}${special ? `, ${SPECIAL_BADGE[special] || special}` : ""}`;

  if (onClick) {
    return (
      <button
        type="button"
        className={cls}
        onClick={onClick}
        aria-label={label}
      >
        {inner}
      </button>
    );
  }

  return (
    <div className={cls} aria-label={label}>
      {inner}
    </div>
  );
}
