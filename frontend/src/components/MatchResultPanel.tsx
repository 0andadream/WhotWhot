"use client";

import Link from "next/link";
import { useCallback, useState } from "react";

type Props = {
  won: boolean;
  matchId: string;
  submitted: boolean;
  pending: boolean;
  onConfirm: () => void;
  /** On-chain fully resolved */
  resolved?: boolean;
  opponentName?: string;
};

/**
 * Celebratory / clear dual-confirm result UI after a match ends.
 */
export function MatchResultPanel({
  won,
  matchId,
  submitted,
  pending,
  onConfirm,
  resolved,
  opponentName = "Opponent",
}: Props) {
  const [shareMsg, setShareMsg] = useState<string | null>(null);

  const share = useCallback(async () => {
    const url =
      typeof window !== "undefined"
        ? `${window.location.origin}/play/match/${matchId}`
        : `https://whotwhot.xyz/play/match/${matchId}`;
    const text = won
      ? `I just won both Megapot tickets on WhotWhot 🔥 Table #${matchId}`
      : `Tough table on WhotWhot — rematch me? #${matchId}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "WhotWhot", text, url });
        setShareMsg("Shared");
      } else {
        await navigator.clipboard.writeText(`${text}\n${url}`);
        setShareMsg("Link copied");
      }
    } catch {
      try {
        await navigator.clipboard.writeText(url);
        setShareMsg("Link copied");
      } catch {
        setShareMsg("Could not share");
      }
    }
    window.setTimeout(() => setShareMsg(null), 2500);
  }, [matchId, won]);

  if (resolved) {
    return (
      <div className={`match-result-panel${won ? " is-win" : " is-loss"}`}>
        <p className="match-result-eyebrow">
          {won ? "Victory" : "Match settled"}
        </p>
        <h2 className="match-result-title">
          {won ? "Both tickets are yours" : "Tickets transferred"}
        </h2>
        <p className="match-result-lede">
          {won
            ? "Escrow released both Megapot ticket NFTs to your wallet. Check ownership or claim any Megapot prize."
            : `${opponentName} received both staked tickets.`}
        </p>
        <div className="match-result-tickets" aria-hidden>
          <span className="match-result-ticket">🎟</span>
          <span className="match-result-arrow">→</span>
          <span className="match-result-ticket">🎟</span>
          <span className="match-result-arrow">→</span>
          <span className="match-result-winner">{won ? "You" : "Winner"}</span>
        </div>
        <div className="match-result-actions">
          {won && (
            <button type="button" className="btn btn-primary" onClick={() => void share()}>
              Share win
            </button>
          )}
          <Link href="/play/create" className="btn btn-primary">
            Rematch
          </Link>
          <Link
            href={`/play/match/${matchId}/tickets`}
            className="btn btn-ghost"
          >
            Tickets &amp; prizes
          </Link>
          <Link href="/play" className="btn btn-ghost">
            Lobby
          </Link>
        </div>
        {shareMsg && <p className="match-result-share-msg">{shareMsg}</p>}
      </div>
    );
  }

  return (
    <div className={`match-result-panel${won ? " is-win" : " is-loss"}`}>
      <p className="match-result-eyebrow">
        {won ? "You won the table" : "Opponent wins"}
      </p>
      <h2 className="match-result-title">
        {won ? "Claim both tickets" : "Confirm so tickets can transfer"}
      </h2>
      <p className="match-result-lede">
        Dual confirm: both wallets must sign the same winner. Then both staked
        Megapot tickets move to the winner on Base.
      </p>
      <div className="match-result-tickets" aria-hidden>
        <div className="match-result-lock">
          <span>🎟</span>
          <em>You</em>
        </div>
        <div className="match-result-lock">
          <span>🎟</span>
          <em>{opponentName}</em>
        </div>
        <span className="match-result-arrow">→</span>
        <div className="match-result-lock winner">
          <span>🎟🎟</span>
          <em>{won ? "You" : "Winner"}</em>
        </div>
      </div>
      <div className="match-result-actions">
        <button
          type="button"
          className="btn btn-primary match-result-claim"
          disabled={pending || submitted}
          onClick={onConfirm}
        >
          {pending
            ? "Confirm in wallet…"
            : submitted
              ? "Waiting for opponent…"
              : won
                ? "Claim both tickets"
                : "Confirm opponent won"}
        </button>
        {won && (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => void share()}
          >
            Share
          </button>
        )}
        <Link href="/play/create" className="btn btn-ghost">
          Rematch
        </Link>
      </div>
      {shareMsg && <p className="match-result-share-msg">{shareMsg}</p>}
    </div>
  );
}
