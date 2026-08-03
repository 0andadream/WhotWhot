"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { WhotCard } from "./WhotCard";
import { SuitIcon } from "./SuitIcon";
import {
  aiChooseAction,
  createGame,
  legalMoves,
  reduce,
} from "@/lib/whot/engine";
import { PLAYABLE_SHAPES, SHAPE_LABEL } from "@/lib/whot/deck";
import type { Card, GameState, PlayerId, Shape } from "@/lib/whot/types";
import {
  isMoveSoundMuted,
  playOpponentMoveSound,
  setMoveSoundMuted,
  unlockMoveSound,
} from "@/lib/moveSound";

interface Props {
  seed: string;
  humanPlayer?: PlayerId;
  vsAi?: boolean;
  p1Name?: string;
  p2Name?: string;
  onWin?: (winner: PlayerId) => void;
  externalState?: GameState;
  onAction?: (action: Parameters<typeof reduce>[1]) => void;
  readOnly?: boolean;
  /** Show mute control (vs AI practice) */
  showSoundToggle?: boolean;
}

export function GameBoard({
  seed,
  humanPlayer = "p1",
  vsAi = true,
  p1Name = "You",
  p2Name = "AI",
  onWin,
  externalState,
  onAction,
  readOnly,
  showSoundToggle = false,
}: Props) {
  const [local, setLocal] = useState<GameState>(() =>
    createGame(seed, p1Name, p2Name)
  );
  const state = externalState ?? local;
  const [selected, setSelected] = useState<Card | null>(null);
  const [pickingShape, setPickingShape] = useState(false);
  const [soundMuted, setSoundMuted] = useState(false);
  /** Prevents onWin from re-firing wallet prompts on every re-render */
  const winFiredRef = useRef(false);
  const onWinRef = useRef(onWin);
  onWinRef.current = onWin;

  useEffect(() => {
    setSoundMuted(isMoveSoundMuted());
  }, []);

  const apply = (action: Parameters<typeof reduce>[1]) => {
    unlockMoveSound();
    if (onAction) {
      onAction(action);
      return;
    }
    setLocal((s) => reduce(s, action));
  };

  useEffect(() => {
    if (!state.winner || winFiredRef.current) return;
    winFiredRef.current = true;
    onWinRef.current?.(state.winner);
  }, [state.winner]);

  /**
   * AI turn runner. Hold On / Suspension keep turn on the AI — chain extra
   * moves instead of relying on effect re-fire (turn may not change).
   */
  useEffect(() => {
    if (!vsAi || externalState || state.winner) return;
    const ai: PlayerId = humanPlayer === "p1" ? "p2" : "p1";
    if (state.turn !== ai) return;

    let cancelled = false;
    const timers: number[] = [];

    const schedule = (ms: number, fn: () => void) => {
      const id = window.setTimeout(fn, ms);
      timers.push(id);
    };

    const playAiOnce = () => {
      if (cancelled) return;
      setLocal((s) => {
        if (cancelled || s.winner || s.turn !== ai) return s;
        const next = reduce(s, aiChooseAction(s, ai));
        // Extra turn (Hold On = 1, Suspension, etc.)
        if (!next.winner && next.turn === ai) {
          schedule(650, playAiOnce);
        } else if (!next.winner) {
          queueMicrotask(() => playOpponentMoveSound());
        }
        return next;
      });
    };

    schedule(700, playAiOnce);

    return () => {
      cancelled = true;
      timers.forEach((id) => window.clearTimeout(id));
    };
    // Only re-enter when turn flips to AI (not on every log line)
  }, [state.turn, state.winner, vsAi, humanPlayer, externalState]);

  const me = state.players[humanPlayer === "p1" ? 0 : 1];
  const opp = state.players[humanPlayer === "p1" ? 1 : 0];
  const myTurn = state.turn === humanPlayer && !state.winner && !readOnly;
  const moves = useMemo(
    () => (myTurn ? legalMoves(state, humanPlayer) : []),
    [state, humanPlayer, myTurn]
  );
  const moveIds = new Set(moves.map((m) => m.id));
  const top = state.discard[state.discard.length - 1];

  const tryPlay = (card: Card) => {
    if (!myTurn || !moveIds.has(card.id)) return;
    unlockMoveSound();
    if (card.special === "whot") {
      setSelected(card);
      setPickingShape(true);
      return;
    }
    apply({ type: "PLAY_CARD", player: humanPlayer, cardId: card.id });
    setSelected(null);
  };

  const confirmWhot = (shape: Shape) => {
    if (!selected) return;
    unlockMoveSound();
    apply({
      type: "PLAY_CARD",
      player: humanPlayer,
      cardId: selected.id,
      calledShape: shape,
    });
    setSelected(null);
    setPickingShape(false);
  };

  return (
    <div
      className="game-layout game-fit"
      onPointerDown={() => unlockMoveSound()}
    >
      <div className="game-main">
        <div className="game-fit-top">
          <div
            className={`banner game-fit-banner ${state.winner ? "win" : myTurn ? "turn" : ""}`}
          >
            {state.winner
              ? state.winner === humanPlayer
                ? "You win! 🎉"
                : `${opp.name} wins`
              : state.pendingPenalty
                ? `⚡ Pick ${state.pendingPenalty.amount} or stack`
                : myTurn
                  ? "Your turn"
                  : `${opp.name}'s turn…`}
          </div>
          {(showSoundToggle || vsAi) && !externalState && (
            <button
              type="button"
              className="btn btn-ghost btn-sm game-fit-sound"
              onClick={() => {
                unlockMoveSound();
                const next = !soundMuted;
                setSoundMuted(next);
                setMoveSoundMuted(next);
                if (!next) playOpponentMoveSound();
              }}
            >
              {soundMuted ? "🔇" : "🔊"}
            </button>
          )}
        </div>

        <div className="felt-table game-fit-felt">
          <div className="game-fit-opp-label">
            {opp.name} · {opp.hand.length}
          </div>
          <div className="opp-hand">
            {opp.hand.slice(0, 10).map((c) => (
              <WhotCard key={c.id} faceDown small />
            ))}
            {opp.hand.length > 10 && (
              <span className="pill">+{opp.hand.length - 10}</span>
            )}
          </div>

          <div className="table">
            <button
              type="button"
              className="table-stack"
              style={{ background: "none", border: "none", padding: 0 }}
              onClick={() => {
                if (myTurn && !state.pendingPenalty) {
                  apply({ type: "DRAW", player: humanPlayer });
                }
              }}
              disabled={!myTurn || !!state.pendingPenalty}
              aria-label="Draw from market"
            >
              <WhotCard faceDown />
              <span className="pill">Market · {state.deck.length}</span>
            </button>
            <div className="table-stack">
              <WhotCard card={top} />
              <span className="pill" style={{ gap: 6 }}>
                <SuitIcon
                  shape={
                    state.currentShape === "whot" ? "circle" : state.currentShape
                  }
                  size={14}
                />
                {SHAPE_LABEL[state.currentShape]}
                {state.currentNumber !== 20 ? ` · #${state.currentNumber}` : ""}
              </span>
            </div>
          </div>
        </div>

        {pickingShape && (
          <div className="game-fit-shape">
            <span className="muted">Call a shape</span>
            <div className="shape-picker">
              {PLAYABLE_SHAPES.map((sh) => (
                <button
                  key={sh}
                  type="button"
                  onClick={() => confirmWhot(sh)}
                  aria-label={sh}
                >
                  <SuitIcon shape={sh} size={22} />
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="hand-dock game-fit-hand">
          <div className="game-fit-hand-label">
            Your hand · {me.hand.length}
            {myTurn && !state.pendingPenalty && (
              <button
                type="button"
                className="game-fit-market-btn"
                onClick={() => apply({ type: "DRAW", player: humanPlayer })}
              >
                Market
              </button>
            )}
            {myTurn && state.pendingPenalty && (
              <button
                type="button"
                className="game-fit-market-btn accept"
                onClick={() =>
                  apply({ type: "ACCEPT_PENALTY", player: humanPlayer })
                }
              >
                Accept pick {state.pendingPenalty.amount}
              </button>
            )}
          </div>
          <div className="hand">
            {me.hand.map((c) => (
              <WhotCard
                key={c.id}
                card={c}
                playable={myTurn && moveIds.has(c.id)}
                selected={selected?.id === c.id}
                onClick={myTurn ? () => tryPlay(c) : undefined}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
