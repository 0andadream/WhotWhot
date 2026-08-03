"use client";

import { useEffect, useMemo, useState } from "react";
import { WhotCard } from "./WhotCard";
import {
  aiChooseAction,
  createGame,
  legalMoves,
  reduce,
} from "@/lib/whot/engine";
import { PLAYABLE_SHAPES, SHAPE_LABEL, SHAPE_SYMBOL } from "@/lib/whot/deck";
import type { Card, GameState, PlayerId, Shape } from "@/lib/whot/types";

interface Props {
  seed: string;
  /** Human is always p1 in local/AI; in multiplayer set from wallet */
  humanPlayer?: PlayerId;
  vsAi?: boolean;
  p1Name?: string;
  p2Name?: string;
  onWin?: (winner: PlayerId) => void;
  /** When provided, parent owns state (for multiplayer sync) */
  externalState?: GameState;
  onAction?: (action: Parameters<typeof reduce>[1]) => void;
  readOnly?: boolean;
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
}: Props) {
  const [local, setLocal] = useState<GameState>(() =>
    createGame(seed, p1Name, p2Name)
  );
  const state = externalState ?? local;
  const [selected, setSelected] = useState<Card | null>(null);
  const [pickingShape, setPickingShape] = useState(false);

  const apply = (action: Parameters<typeof reduce>[1]) => {
    if (onAction) {
      onAction(action);
      return;
    }
    setLocal((s) => reduce(s, action));
  };

  useEffect(() => {
    if (state.winner && onWin) onWin(state.winner);
  }, [state.winner, onWin]);

  // AI turn
  useEffect(() => {
    if (!vsAi || externalState || state.winner) return;
    const ai: PlayerId = humanPlayer === "p1" ? "p2" : "p1";
    if (state.turn !== ai) return;
    const t = setTimeout(() => {
      const action = aiChooseAction(state, ai);
      setLocal((s) => reduce(s, action));
    }, 650);
    return () => clearTimeout(t);
  }, [state, vsAi, humanPlayer, externalState]);

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
    <div className="stack">
      <div className="banner">
        {state.winner
          ? state.winner === humanPlayer
            ? "You win! 🎉"
            : `${opp.name} wins`
          : state.pendingPenalty
            ? `Penalty: pick ${state.pendingPenalty.amount} — stack or accept`
            : myTurn
              ? "Your turn"
              : `${opp.name}'s turn`}
      </div>

      <div className="card-panel">
        <div className="muted" style={{ textAlign: "center", marginBottom: 8 }}>
          {opp.name} · {opp.hand.length} cards
        </div>
        <div className="opp-hand">
          {opp.hand.map((c) => (
            <WhotCard key={c.id} faceDown small />
          ))}
        </div>
      </div>

      <div className="table">
        <div className="table-stack">
          <WhotCard faceDown />
          <span className="muted">Market ({state.deck.length})</span>
        </div>
        <div className="table-stack">
          <WhotCard card={top} />
          <span className="pill">
            Call: {SHAPE_SYMBOL[state.currentShape]} {SHAPE_LABEL[state.currentShape]}
            {state.currentNumber !== 20 ? ` · #${state.currentNumber}` : ""}
          </span>
        </div>
      </div>

      {pickingShape && (
        <div className="card-panel">
          <h2>Call a shape</h2>
          <div className="shape-picker">
            {PLAYABLE_SHAPES.map((sh) => (
              <button key={sh} type="button" onClick={() => confirmWhot(sh)}>
                {SHAPE_SYMBOL[sh]}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="card-panel">
        <div className="muted" style={{ marginBottom: 4 }}>
          Your hand · {me.hand.length} cards
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

        {myTurn && (
          <div className="row" style={{ marginTop: 10 }}>
            {state.pendingPenalty ? (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() =>
                  apply({ type: "ACCEPT_PENALTY", player: humanPlayer })
                }
              >
                Accept pick {state.pendingPenalty.amount}
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => apply({ type: "DRAW", player: humanPlayer })}
              >
                Go to market
              </button>
            )}
          </div>
        )}
      </div>

      <div className="log">
        {[...state.log].reverse().map((line, i) => (
          <div key={i}>{line}</div>
        ))}
      </div>
    </div>
  );
}
