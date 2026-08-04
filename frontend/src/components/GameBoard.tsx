"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { WhotCard } from "./WhotCard";
import { SuitIcon } from "./SuitIcon";
import { ProfileAvatar } from "./ProfileAvatar";
import { BrandLogo } from "./BrandLogo";
import {
  aiChooseAction,
  createGame,
  legalMoves,
  reduce,
} from "@/lib/whot/engine";
import { PLAYABLE_SHAPES, SHAPE_LABEL } from "@/lib/whot/deck";
import type { Card, GameState, PlayerId, Shape } from "@/lib/whot/types";
import type { PlayerProfile } from "@/lib/profile";
import {
  isMoveSoundMuted,
  playOpponentMoveSound,
  setMoveSoundMuted,
  unlockMoveSound,
} from "@/lib/moveSound";

const TURN_SECONDS = 45;

type ProfileBits = Pick<PlayerProfile, "username" | "avatar" | "color">;

interface Props {
  seed: string;
  humanPlayer?: PlayerId;
  vsAi?: boolean;
  p1Name?: string;
  p2Name?: string;
  onWin?: (winner: PlayerId) => void;
  /** Fired when local player times out (opponent wins) */
  onTimeoutForfeit?: (winner: PlayerId) => void;
  externalState?: GameState;
  onAction?: (action: Parameters<typeof reduce>[1]) => void;
  readOnly?: boolean;
  showSoundToggle?: boolean;
  /** Tickets staked by each player (display) */
  stakeTickets?: number;
  /** Total pot tickets (display) */
  potTickets?: number;
  /** Player ticket balance label */
  ticketBalance?: number | string;
  meProfile?: ProfileBits | null;
  oppProfile?: ProfileBits | null;
  /** Optional chat panel content for drawer */
  chatContent?: ReactNode;
  /** Extra menu links (multiplayer) */
  menuExtra?: ReactNode;
  backHref?: string;
}

type FxKind =
  | null
  | "pick_two"
  | "pick_three"
  | "general_market"
  | "hold_on"
  | "suspension"
  | "whot"
  | "impact";

function fanPose(i: number, n: number, spread = 42, lift = 10) {
  if (n <= 1) return { rotate: 0, x: 0, y: 0 };
  const t = n === 1 ? 0.5 : i / (n - 1);
  const mid = t - 0.5;
  return {
    rotate: mid * spread,
    x: mid * Math.min(48, 520 / Math.max(n, 1)),
    y: Math.abs(mid) * lift,
  };
}

export function GameBoard({
  seed,
  humanPlayer = "p1",
  vsAi = true,
  p1Name = "You",
  p2Name = "AI",
  onWin,
  onTimeoutForfeit,
  externalState,
  onAction,
  readOnly,
  showSoundToggle = false,
  stakeTickets = 1,
  potTickets = 2,
  ticketBalance,
  meProfile,
  oppProfile,
  chatContent,
  menuExtra,
  backHref = "/play",
}: Props) {
  const reduceMotion = useReducedMotion();
  const [local, setLocal] = useState<GameState>(() =>
    createGame(seed, p1Name, p2Name)
  );
  const state = externalState ?? local;
  const [selected, setSelected] = useState<Card | null>(null);
  const [pickingShape, setPickingShape] = useState(false);
  const [soundMuted, setSoundMuted] = useState(false);
  const [chatOpen, setChatOpen] = useState(!!chatContent);
  const [menuOpen, setMenuOpen] = useState(false);
  const [fx, setFx] = useState<FxKind>(null);
  const [ripple, setRipple] = useState(0);
  const [deckShake, setDeckShake] = useState(false);
  const [turnLeft, setTurnLeft] = useState(TURN_SECONDS);
  const [impactKey, setImpactKey] = useState(0);
  /** Opponent wins after local player ran out of time */
  const [timeoutWinner, setTimeoutWinner] = useState<PlayerId | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [turnPulse, setTurnPulse] = useState(0);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const [spotlight, setSpotlight] = useState<{ x: number; y: number } | null>(
    null
  );

  const arenaRef = useRef<HTMLDivElement>(null);
  const prevTopId = useRef<string | null>(null);
  const prevLogLen = useRef(0);
  const prevTurn = useRef(state.turn);
  const winFiredRef = useRef(false);
  const timeoutFiredRef = useRef(false);
  const onWinRef = useRef(onWin);
  const onTimeoutRef = useRef(onTimeoutForfeit);
  onWinRef.current = onWin;
  onTimeoutRef.current = onTimeoutForfeit;

  useEffect(() => {
    setSoundMuted(isMoveSoundMuted());
  }, []);

  const apply = useCallback(
    (action: Parameters<typeof reduce>[1]) => {
      unlockMoveSound();
      if (onAction) {
        onAction(action);
        return;
      }
      setLocal((s) => reduce(s, action));
    },
    [onAction]
  );

  const effectiveWinner = timeoutWinner || state.winner;

  useEffect(() => {
    if (!effectiveWinner || winFiredRef.current) return;
    winFiredRef.current = true;
    onWinRef.current?.(effectiveWinner);
  }, [effectiveWinner]);

  /* AI turns */
  useEffect(() => {
    if (!vsAi || externalState || effectiveWinner) return;
    const ai: PlayerId = humanPlayer === "p1" ? "p2" : "p1";
    if (state.turn !== ai) return;

    let cancelled = false;
    const timers: number[] = [];
    const schedule = (ms: number, fn: () => void) => {
      timers.push(window.setTimeout(fn, ms));
    };

    const playAiOnce = () => {
      if (cancelled) return;
      setLocal((s) => {
        if (cancelled || s.winner || s.turn !== ai) return s;
        const next = reduce(s, aiChooseAction(s, ai));
        if (!next.winner && next.turn === ai) schedule(650, playAiOnce);
        else if (!next.winner) queueMicrotask(() => playOpponentMoveSound());
        return next;
      });
    };

    schedule(700, playAiOnce);
    return () => {
      cancelled = true;
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, [state.turn, effectiveWinner, vsAi, humanPlayer, externalState]);

  /* Living table reactions from state changes */
  useEffect(() => {
    const top = state.discard[state.discard.length - 1];
    const topId = top?.id ?? null;
    if (prevTopId.current && topId && topId !== prevTopId.current) {
      setRipple((n) => n + 1);
      setImpactKey((k) => k + 1);
      const special = top?.special;
      if (special === "pick_two" || special === "pick_three") {
        setFx(special);
      } else if (special === "general_market") {
        setFx("general_market");
      } else if (special === "hold_on") {
        setFx("hold_on");
      } else if (special === "suspension") {
        setFx("suspension");
      } else if (special === "whot") {
        setFx("whot");
      } else {
        setFx("impact");
      }
      const clear = window.setTimeout(() => setFx(null), 900);
      return () => window.clearTimeout(clear);
    }
    prevTopId.current = topId;
  }, [state.discard]);

  useEffect(() => {
    if (state.log.length > prevLogLen.current) {
      const last = state.log[state.log.length - 1] || "";
      if (/market|draw|picked/i.test(last)) {
        setDeckShake(true);
        const t = window.setTimeout(() => setDeckShake(false), 420);
        return () => window.clearTimeout(t);
      }
    }
    prevLogLen.current = state.log.length;
  }, [state.log]);

  /* Turn countdown — only ticks on your turn; timeout = forfeit */
  useEffect(() => {
    if (effectiveWinner) return;
    if (prevTurn.current !== state.turn) {
      setTurnLeft(TURN_SECONDS);
      timeoutFiredRef.current = false;
      setTurnPulse((n) => n + 1);
      prevTurn.current = state.turn;
    }
  }, [state.turn, effectiveWinner]);

  useEffect(() => {
    if (effectiveWinner || readOnly) return;
    if (state.turn !== humanPlayer) return;
    const id = window.setInterval(() => {
      setTurnLeft((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => window.clearInterval(id);
  }, [state.turn, effectiveWinner, humanPlayer, readOnly]);

  useEffect(() => {
    if (effectiveWinner || readOnly || timeoutFiredRef.current) return;
    if (turnLeft > 0) return;
    if (state.turn !== humanPlayer) return;

    timeoutFiredRef.current = true;
    const oppId: PlayerId = humanPlayer === "p1" ? "p2" : "p1";
    setTimeoutWinner(oppId);
    setPickingShape(false);
    setSelected(null);
    setLeaving(true);

    if (!externalState) {
      setLocal((s) => ({
        ...s,
        winner: oppId,
        log: [
          ...s.log,
          `Time's up — ${s.players[humanPlayer === "p1" ? 0 : 1].name} forfeits.`,
        ],
      }));
    }

    onTimeoutRef.current?.(oppId);
    // Leave flash then settle into flat hand review
    const t = window.setTimeout(() => setLeaving(false), 900);
    return () => window.clearTimeout(t);
  }, [
    turnLeft,
    effectiveWinner,
    humanPlayer,
    readOnly,
    externalState,
    state.turn,
  ]);

  const me = state.players[humanPlayer === "p1" ? 0 : 1];
  const opp = state.players[humanPlayer === "p1" ? 1 : 0];
  const gameOver = !!effectiveWinner;
  const myTurn =
    state.turn === humanPlayer && !gameOver && !readOnly;
  const moves = useMemo(
    () => (myTurn ? legalMoves(state, humanPlayer) : []),
    [state, humanPlayer, myTurn]
  );
  const moveIds = useMemo(() => new Set(moves.map((m) => m.id)), [moves]);
  const top = state.discard[state.discard.length - 1];

  const meBits: ProfileBits = meProfile || {
    username: me.name,
    avatar: "🃏",
    color: "#c41e3a",
  };
  const oppBits: ProfileBits = oppProfile || {
    username: opp.name,
    avatar: vsAi ? "🤖" : "🃏",
    color: "#3b82f6",
  };

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
    setPickingShape(false);
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

  const onDraw = () => {
    if (!myTurn || state.pendingPenalty) return;
    setDeckShake(true);
    window.setTimeout(() => setDeckShake(false), 420);
    apply({ type: "DRAW", player: humanPlayer });
  };

  const updateSpotlight = (clientX: number, clientY: number) => {
    if (!arenaRef.current) return;
    const r = arenaRef.current.getBoundingClientRect();
    setSpotlight({ x: clientX - r.left, y: clientY - r.top });
  };

  const endDrag = (clientX: number, clientY: number, card: Card) => {
    setDragId(null);
    setDragPos(null);
    setSpotlight(null);
    if (!myTurn || !moveIds.has(card.id) || !arenaRef.current) return;
    const r = arenaRef.current.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const dist = Math.hypot(clientX - cx, clientY - cy);
    if (dist < r.width * 0.48) {
      tryPlay(card);
    }
  };

  const timerLow = turnLeft <= 10 && myTurn && !gameOver;
  const timedOut = !!timeoutWinner;

  const oppFan = opp.hand.slice(0, 14);
  const meName = meBits.username || me.name;
  const oppName = oppBits.username || opp.name;

  const turnLabel = effectiveWinner
    ? timedOut && effectiveWinner !== humanPlayer
      ? "Time's up — you lose"
      : effectiveWinner === humanPlayer
        ? "You win"
        : `${opp.name} wins`
    : state.pendingPenalty
      ? `Pick ${state.pendingPenalty.amount} or stack`
      : myTurn
        ? "Your turn"
        : `${opp.name}'s turn`;

  const stakeLabel =
    stakeTickets === 0
      ? "Free"
      : `${stakeTickets} ticket${stakeTickets === 1 ? "" : "s"}`;
  const potLabel =
    potTickets === 0
      ? "Practice"
      : `${potTickets} ticket${potTickets === 1 ? "" : "s"}`;

  return (
    <div
      className={`table-page${leaving ? " is-leaving" : ""}${
        gameOver ? " is-over" : ""
      }${fx === "hold_on" ? " is-hold" : ""}${
        fx === "suspension" ? " is-suspension" : ""
      }`}
      onPointerDown={() => unlockMoveSound()}
    >
      <div className="table-wood">
        <div className="table-wood-grain" aria-hidden />

        {/* Top chrome */}
        <header className="table-topbar">
          <div className="table-brand-glass">
            <Link href={backHref} className="table-brand-link">
              <BrandLogo href="" withWordmark={false} size={26} />
              <span className="table-brand-name">
                WhotWhot
                <em>{vsAi ? "Practice" : "Live"}</em>
              </span>
            </Link>
            <div className="table-brand-tabs">
              <Link href="/play">Play</Link>
              <Link href="/guide">Rules</Link>
            </div>
          </div>

          <div className="table-match-title">
            Current Match:{" "}
            <strong>
              {oppName} vs. {meName}
            </strong>
            <span className="table-match-meta">
              🎟 {stakeLabel} · Pot {potLabel}
            </span>
          </div>

          <div className="table-top-actions">
            {chatContent && (
              <button
                type="button"
                className={`table-icon-btn${chatOpen ? " active" : ""}`}
                onClick={() => {
                  setChatOpen((v) => !v);
                  setMenuOpen(false);
                }}
                aria-label="Chat"
              >
                💬
              </button>
            )}
            <button
              type="button"
              className={`table-icon-btn${menuOpen ? " active" : ""}`}
              onClick={() => {
                setMenuOpen((v) => !v);
                setChatOpen(false);
              }}
              aria-label="Settings"
            >
              ⚙
            </button>
          </div>
        </header>

        {/* Main table field */}
        <div
          ref={arenaRef}
          className={`table-field${turnPulse ? " is-turn-pulse" : ""}${
            fx === "impact" || impactKey ? " is-impact" : ""
          }`}
          key={`pulse-${turnPulse}`}
          onPointerMove={(e) => {
            if (dragId) updateSpotlight(e.clientX, e.clientY);
          }}
        >
          <div
            className={`table-spotlight${spotlight ? " on" : ""}`}
            style={
              spotlight ? { left: spotlight.x, top: spotlight.y } : undefined
            }
            aria-hidden
          />
          <div
            key={ripple}
            className={`table-ripple${ripple ? " go" : ""}`}
            aria-hidden
          />

          {/* Opponent — TOP, name beside cards */}
          <section
            className={`table-seat table-seat-opp${
              fx === "suspension" ? " is-frozen" : ""
            }`}
          >
            <div className="table-seat-row">
              <div className={`table-seat-id${vsAi ? " no-avatar" : ""}`}>
                {!vsAi && <ProfileAvatar profile={oppBits} size={44} />}
                <div>
                  <strong>{oppName}</strong>
                  <span>{opp.hand.length} cards</span>
                </div>
              </div>
              <div className="table-hand-flat table-hand-opp" aria-hidden>
                {oppFan.map((c) => (
                  <div key={c.id} className="table-hand-card is-opp">
                    <WhotCard faceDown small />
                  </div>
                ))}
                {opp.hand.length > 14 && (
                  <span className="table-pile-label">+{opp.hand.length - 14}</span>
                )}
              </div>
            </div>
            {fx === "suspension" && (
              <span className="table-freeze" aria-hidden>
                🔒
              </span>
            )}
          </section>

          {/* Market stack — LEFT */}
          <button
            type="button"
            className={`table-draw table-draw-left${
              deckShake ? " is-shake" : ""
            }${myTurn && !state.pendingPenalty ? " is-ready" : ""}`}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onDraw();
            }}
            disabled={!myTurn || !!state.pendingPenalty || gameOver}
            aria-label="Draw from market"
            title={
              !myTurn
                ? "Wait for your turn"
                : state.pendingPenalty
                  ? "Accept pick or stack first"
                  : "Draw 1 from market"
            }
          >
            <div className="table-draw-stack" aria-hidden>
              <span className="table-draw-card c1">
                <WhotCard faceDown />
              </span>
              <span className="table-draw-card c2">
                <WhotCard faceDown />
              </span>
              <span className="table-draw-card c3">
                <WhotCard faceDown />
              </span>
              <span className="table-draw-card c4">
                <WhotCard faceDown />
              </span>
            </div>
            <span className="table-pile-label">
              Market
              <em>{state.deck.length}</em>
            </span>
          </button>

          {/* Suit strip — when calling Whot (right of play pad) */}
          {pickingShape && (
            <div
              className="table-suit-strip is-active"
              aria-label="Call a shape"
            >
              <p className="table-suit-hint">Call a shape</p>
              <div className="table-suit-col">
                {PLAYABLE_SHAPES.map((sh) => (
                  <button
                    key={sh}
                    type="button"
                    className="pickable"
                    onClick={() => confirmWhot(sh)}
                    aria-label={SHAPE_LABEL[sh]}
                  >
                    <SuitIcon shape={sh} size={22} />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Play pile — center pad */}
          <div className="table-play-pad">
            <span className="table-pile-label top">Play pile</span>
            <motion.div
              key={top?.id || "empty"}
              className="table-play-card"
              initial={
                reduceMotion
                  ? false
                  : { scale: 0.7, y: 36, opacity: 0, rotate: -8 }
              }
              animate={{ scale: 1, y: 0, opacity: 1, rotate: 0 }}
              transition={{
                type: "spring",
                stiffness: 380,
                damping: 16,
                mass: 0.75,
              }}
            >
              <WhotCard card={top} />
            </motion.div>
            <span className="table-pile-label bottom">
              <SuitIcon
                shape={
                  state.currentShape === "whot" ? "circle" : state.currentShape
                }
                size={12}
              />
              {SHAPE_LABEL[state.currentShape]}
              {state.currentNumber !== 20 ? ` · #${state.currentNumber}` : ""}
            </span>
          </div>

          {/* Status under pad */}
          <div className="table-status">
            <span
              className={
                gameOver
                  ? timedOut
                    ? "loss"
                    : "win"
                  : myTurn
                    ? "yours"
                    : "wait"
              }
            >
              {turnLabel}
            </span>
            {!gameOver && state.turn === humanPlayer && (
              <span className={`table-timer${timerLow ? " low" : ""}`}>
                {turnLeft}s
              </span>
            )}
            {myTurn && state.pendingPenalty && (
              <button
                type="button"
                className="table-action-btn"
                onClick={() =>
                  apply({ type: "ACCEPT_PENALTY", player: humanPlayer })
                }
              >
                Accept pick {state.pendingPenalty.amount}
              </button>
            )}
            {myTurn && !state.pendingPenalty && (
              <button
                type="button"
                className="table-action-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onDraw();
                }}
              >
                Go to market
              </button>
            )}
          </div>

          {/* You — BOTTOM, name beside flat cards */}
          <section className="table-seat table-seat-me">
            <div className="table-seat-row me">
              <div className="table-seat-id me">
                <ProfileAvatar profile={meBits} size={44} />
                <div>
                  <strong>YOU</strong>
                  <span>
                    {ticketBalance != null
                      ? String(ticketBalance)
                      : `${me.hand.length} cards`}
                  </span>
                </div>
                {gameOver && (
                  <Link href={backHref} className="table-leave">
                    Leave
                  </Link>
                )}
              </div>
              <div
                className={`table-hand-flat${gameOver ? " is-review" : ""}`}
                aria-label="Your hand"
              >
                {me.hand.map((c) => {
                  const playable = myTurn && moveIds.has(c.id);
                  const isSel = selected?.id === c.id;
                  const isDrag = dragId === c.id;
                  const style: React.CSSProperties | undefined =
                    isDrag && dragPos
                      ? {
                          position: "fixed",
                          left: dragPos.x,
                          top: dragPos.y,
                          transform: "translate(-50%, -50%) scale(1.08)",
                          zIndex: 90,
                        }
                      : undefined;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      className={`table-hand-card${
                        playable ? " is-playable" : ""
                      }${isSel ? " is-selected" : ""}${
                        isDrag ? " is-dragging" : ""
                      }`}
                      style={style}
                      onPointerDown={(e) => {
                        if (gameOver || !playable) return;
                        e.currentTarget.setPointerCapture(e.pointerId);
                        setDragId(c.id);
                        setDragPos({ x: e.clientX, y: e.clientY });
                        setSelected(c);
                        updateSpotlight(e.clientX, e.clientY);
                      }}
                      onPointerMove={(e) => {
                        if (dragId !== c.id) return;
                        setDragPos({ x: e.clientX, y: e.clientY });
                        updateSpotlight(e.clientX, e.clientY);
                      }}
                      onPointerUp={(e) => {
                        if (dragId === c.id) {
                          endDrag(e.clientX, e.clientY, c);
                          return;
                        }
                        if (gameOver) {
                          setSelected((cur) =>
                            cur?.id === c.id ? null : c
                          );
                          return;
                        }
                        if (playable) tryPlay(c);
                      }}
                      onPointerCancel={() => {
                        setDragId(null);
                        setDragPos(null);
                        setSpotlight(null);
                      }}
                      onClick={() => {
                        if (dragId) return;
                        if (gameOver) {
                          setSelected((cur) =>
                            cur?.id === c.id ? null : c
                          );
                          return;
                        }
                        if (playable) tryPlay(c);
                      }}
                      aria-label={`Play ${c.shape} ${c.number}`}
                    >
                      <WhotCard
                        card={c}
                        playable={playable}
                        selected={isSel}
                      />
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          {/* FX */}
          <div className="table-fx" aria-hidden>
            {(fx === "pick_two" || fx === "pick_three") &&
              Array.from({ length: fx === "pick_three" ? 3 : 2 }).map(
                (_, i) => (
                  <span
                    key={i}
                    className={`table-fx-card ${
                      state.turn === humanPlayer ? "fly-me" : "fly-opp"
                    }`}
                    style={{ animationDelay: `${i * 0.08}s` }}
                  />
                )
              )}
            {fx === "general_market" &&
              [0, 1, 2, 3, 4].map((i) => (
                <span
                  key={i}
                  className="table-fx-card fly-market"
                  style={
                    {
                      animationDelay: `${i * 0.06}s`,
                      ["--dx" as string]: `${(i - 2) * 40}px`,
                    } as React.CSSProperties
                  }
                />
              ))}
          </div>
        </div>

        {/* Bottom-left floating chat */}
        {chatContent && chatOpen && (
          <div className="table-chat-float">
            <div className="table-chat-float-head">
              <strong>Chat</strong>
              <button
                type="button"
                className="table-icon-btn sm"
                onClick={() => setChatOpen(false)}
                aria-label="Close chat"
              >
                ×
              </button>
            </div>
            <div className="table-chat-float-body">{chatContent}</div>
          </div>
        )}
        {chatContent && !chatOpen && (
          <button
            type="button"
            className="table-chat-fab"
            onClick={() => setChatOpen(true)}
          >
            Chat
          </button>
        )}
      </div>

      {leaving && (
        <div className="table-leave-flash" aria-hidden>
          <span>Time&apos;s up</span>
        </div>
      )}

      {menuOpen && (
        <>
          <div
            className="table-menu-backdrop"
            onClick={() => setMenuOpen(false)}
          />
          <aside className="table-menu" aria-label="Menu">
            <div className="table-menu-head">
              <h3>Menu</h3>
              <button
                type="button"
                className="table-icon-btn"
                onClick={() => setMenuOpen(false)}
              >
                ×
              </button>
            </div>
            <div className="table-menu-list">
              <Link href={backHref} onClick={() => setMenuOpen(false)}>
                ← Leave table
              </Link>
              <button
                type="button"
                onClick={() => {
                  unlockMoveSound();
                  const next = !soundMuted;
                  setSoundMuted(next);
                  setMoveSoundMuted(next);
                  if (!next) playOpponentMoveSound();
                }}
              >
                {soundMuted ? "Sound off" : "Sound on"}
              </button>
              <Link href="/guide" onClick={() => setMenuOpen(false)}>
                How to play
              </Link>
              {menuExtra}
            </div>
          </aside>
        </>
      )}
    </div>
  );
}
