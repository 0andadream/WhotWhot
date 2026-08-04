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

function particleStyle(i: number): React.CSSProperties {
  const left = 12 + ((i * 37) % 76);
  const top = 20 + ((i * 53) % 60);
  const delay = (i * 0.45) % 4;
  const dur = 3.2 + (i % 5) * 0.35;
  return {
    left: `${left}%`,
    top: `${top}%`,
    animationDelay: `${delay}s`,
    animationDuration: `${dur}s`,
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
  const [chatOpen, setChatOpen] = useState(false);
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

  const timerPct =
    state.turn === humanPlayer && !gameOver
      ? turnLeft / TURN_SECONDS
      : 1;
  const circumference = 2 * Math.PI * 20;
  const dash = circumference * timerPct;
  const timerLow = turnLeft <= 10 && myTurn && !gameOver;
  const timedOut = !!timeoutWinner;

  const oppFan = opp.hand.slice(0, 12);
  const suitOrbit = [
    { shape: "circle" as Shape, angle: -90 },
    { shape: "triangle" as Shape, angle: 0 },
    { shape: "cross" as Shape, angle: 90 },
    { shape: "square" as Shape, angle: 180 },
  ];

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

  return (
    <div
      className={`arena-page${leaving ? " is-leaving" : ""}${
        gameOver ? " is-over" : ""
      }`}
      onPointerDown={() => unlockMoveSound()}
    >
      <div className="arena-shell">
        {/* Nav */}
        <nav className="arena-nav" aria-label="Game">
          <Link href={backHref} className="arena-nav-brand">
            <BrandLogo href="" withWordmark={false} size={28} />
            WhotWhot
            <span>{vsAi ? "· practice" : "· live"}</span>
          </Link>
          <div className="arena-nav-actions">
            {chatContent && (
              <button
                type="button"
                className={`arena-icon-btn${chatOpen ? " active" : ""}`}
                onClick={() => {
                  setChatOpen((v) => !v);
                  setMenuOpen(false);
                }}
              >
                Chat
              </button>
            )}
            <button
              type="button"
              className={`arena-icon-btn${menuOpen ? " active" : ""}`}
              onClick={() => {
                setMenuOpen((v) => !v);
                setChatOpen(false);
              }}
            >
              Menu
            </button>
          </div>
        </nav>

        {/* Opponent */}
        <section
          className={`arena-opp${fx === "suspension" ? " is-frozen" : ""}`}
        >
          <div className="arena-opp-meta">
            <ProfileAvatar profile={oppBits} size={36} />
            <div>
              <div className="arena-opp-name">{oppBits.username || opp.name}</div>
              <div className="arena-opp-count">{opp.hand.length} cards</div>
            </div>
          </div>
          <div className="arena-opp-fan" aria-hidden>
            {oppFan.map((c, i) => {
              const p = fanPose(i, oppFan.length, 36, 8);
              return (
                <div
                  key={c.id}
                  className="arena-fan-card"
                  style={{
                    transform: `translateX(calc(-50% + ${p.x}px)) rotate(${p.rotate}deg) translateY(${p.y}px)`,
                    zIndex: i,
                  }}
                >
                  <WhotCard faceDown small />
                </div>
              );
            })}
            {opp.hand.length > 12 && (
              <span
                className="arena-stack-label"
                style={{ position: "absolute", right: 0, bottom: 8 }}
              >
                +{opp.hand.length - 12}
              </span>
            )}
            {fx === "suspension" && (
              <span className="arena-freeze-lock" aria-hidden>
                🔒
              </span>
            )}
          </div>
        </section>

        {/* Circular arena + attached match details */}
        <div className="arena-stage-wrap">
          <div className="arena-match-details">
            <div className="arena-match-details-title">🎟 Match details</div>
            <div className="arena-match-details-row">
              <span>Stake</span>
              <strong>
                {stakeTickets} Ticket{stakeTickets === 1 ? "" : "s"}
              </strong>
            </div>
            <div className="arena-match-details-row">
              <span>Total pot</span>
              <strong>
                {potTickets} Ticket{potTickets === 1 ? "" : "s"}
              </strong>
            </div>
          </div>

          <div
            ref={arenaRef}
            className={`arena-circle${fx === "hold_on" ? " is-hold" : ""}${
              fx === "whot" || pickingShape ? " is-whot" : ""
            }${fx === "impact" || impactKey ? " is-impact" : ""}${
              turnPulse ? " is-turn-pulse" : ""
            }`}
            key={`pulse-${turnPulse}`}
            onPointerMove={(e) => {
              if (dragId) updateSpotlight(e.clientX, e.clientY);
            }}
          >
            <div className="arena-glow" aria-hidden />
            <div className="arena-glow arena-glow-soft" aria-hidden />
            <div className="arena-ring" aria-hidden />
            <div className="arena-ring-spin" aria-hidden />
            <div className="arena-ring-spin arena-ring-spin-slow" aria-hidden />

            {!reduceMotion && (
              <div className="arena-particles" aria-hidden>
                {Array.from({ length: 16 }).map((_, i) => (
                  <span
                    key={i}
                    className="arena-particle"
                    style={particleStyle(i)}
                  />
                ))}
              </div>
            )}

            <div
              key={ripple}
              className={`arena-ripple${ripple ? " go" : ""}`}
              aria-hidden
            />
            <div
              key={`r2-${ripple}`}
              className={`arena-ripple arena-ripple-delay${ripple ? " go" : ""}`}
              aria-hidden
            />

            <div
              className={`arena-spotlight${spotlight ? " on" : ""}`}
              style={
                spotlight
                  ? { left: spotlight.x, top: spotlight.y }
                  : undefined
              }
              aria-hidden
            />
            <div
              className={`arena-drop-hint${dragId ? " on" : ""}`}
              aria-hidden
            />

            <div className="arena-center">
              <button
                type="button"
                className={`arena-stack${deckShake ? " is-shake" : ""}`}
                onClick={onDraw}
                disabled={!myTurn || !!state.pendingPenalty}
                aria-label="Draw from market"
              >
                <WhotCard faceDown />
                <span className="arena-stack-label">
                  Market · {state.deck.length}
                </span>
              </button>

              <div className="arena-active-wrap">
                <div className="arena-active-glow" aria-hidden />
                <div className="arena-active-lift" aria-hidden />
                <motion.div
                  key={top?.id || "empty"}
                  className="arena-active-card"
                  initial={
                    reduceMotion
                      ? false
                      : { scale: 0.65, y: 48, opacity: 0, rotate: -10 }
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
                <span className="arena-stack-label" style={{ marginTop: 10 }}>
                  <SuitIcon
                    shape={
                      state.currentShape === "whot"
                        ? "circle"
                        : state.currentShape
                    }
                    size={12}
                  />{" "}
                  {SHAPE_LABEL[state.currentShape]}
                  {state.currentNumber !== 20
                    ? ` · #${state.currentNumber}`
                    : ""}
                </span>
              </div>
            </div>

            {/* Whot suit orbit */}
            {pickingShape && (
              <div className="arena-suit-orbit" aria-label="Call a shape">
                {suitOrbit.map((s, i) => {
                  const rad = (s.angle * Math.PI) / 180;
                  const r = 118;
                  const x = Math.cos(rad) * r;
                  const y = Math.sin(rad) * r;
                  return (
                    <button
                      key={s.shape}
                      type="button"
                      style={{
                        transform: `translate(${x}px, ${y}px)`,
                        animationDelay: `${i * 0.05}s`,
                      }}
                      onClick={() => confirmWhot(s.shape)}
                      aria-label={SHAPE_LABEL[s.shape]}
                    >
                      <SuitIcon shape={s.shape} size={22} />
                    </button>
                  );
                })}
              </div>
            )}

            {/* Special FX cards */}
            <div className="arena-fx" aria-hidden>
              {(fx === "pick_two" || fx === "pick_three") &&
                Array.from({
                  length: fx === "pick_three" ? 3 : 2,
                }).map((_, i) => (
                  <span
                    key={i}
                    className={`arena-fx-card ${
                      state.turn === humanPlayer ? "fly-me" : "fly-opp"
                    }`}
                    style={{ animationDelay: `${i * 0.08}s` }}
                  />
                ))}
              {fx === "general_market" &&
                [0, 1, 2, 3, 4].map((i) => (
                  <span
                    key={i}
                    className="arena-fx-card fly-market"
                    style={
                      {
                        animationDelay: `${i * 0.06}s`,
                        ["--dx" as string]: `${(i - 2) * 36}px`,
                        ["--dy" as string]: `${
                          state.turn === humanPlayer ? 140 : -140
                        }px`,
                      } as React.CSSProperties
                    }
                  />
                ))}
            </div>
          </div>
        </div>

        {/* Turn */}
        <div className="arena-turn">
          <div
            className={`arena-turn-label${
              gameOver
                ? timedOut
                  ? " loss"
                  : " win"
                : myTurn
                  ? " yours"
                  : " waiting"
            }`}
          >
            {turnLabel}
          </div>
          {!gameOver && state.turn === humanPlayer && (
            <div className={`arena-timer${timerLow ? " low" : ""}`}>
              <svg viewBox="0 0 48 48" aria-hidden>
                <circle className="track" cx="24" cy="24" r="20" />
                <circle
                  className="prog"
                  cx="24"
                  cy="24"
                  r="20"
                  strokeDasharray={`${dash} ${circumference}`}
                />
              </svg>
              <span className="num">{turnLeft}</span>
            </div>
          )}
          {myTurn && (
            <div className="arena-turn-actions">
              {state.pendingPenalty ? (
                <button
                  type="button"
                  className="prem-btn-white sm"
                  onClick={() =>
                    apply({ type: "ACCEPT_PENALTY", player: humanPlayer })
                  }
                >
                  Accept pick {state.pendingPenalty.amount}
                </button>
              ) : (
                <button
                  type="button"
                  className="prem-btn-ghost sm"
                  onClick={onDraw}
                >
                  Go to market
                </button>
              )}
            </div>
          )}
        </div>

        {/* Flat hand — always visible & tappable */}
        <section className="arena-me">
          <div className="arena-me-meta">
            <ProfileAvatar profile={meBits} size={40} />
            <div className="arena-me-info">
              <div className="arena-me-name">{meBits.username || me.name}</div>
              <div className="arena-me-tickets">
                {gameOver ? "Your hand · " : "Balance · "}
                <em>
                  {gameOver
                    ? `${me.hand.length} cards`
                    : ticketBalance != null
                      ? ticketBalance
                      : `${me.hand.length} cards`}
                </em>
              </div>
            </div>
            {gameOver && (
              <Link href={backHref} className="arena-icon-btn arena-leave-btn">
                Leave
              </Link>
            )}
          </div>

          <div
            className={`arena-hand-flat${gameOver ? " is-review" : ""}`}
            aria-label="Your hand"
          >
            {me.hand.map((c) => {
              const playable = myTurn && moveIds.has(c.id);
              const isSel = selected?.id === c.id;
              const isDrag = dragId === c.id;
              const dragStyle: React.CSSProperties | undefined =
                isDrag && dragPos
                  ? {
                      position: "fixed",
                      left: dragPos.x,
                      top: dragPos.y,
                      transform: "translate(-50%, -50%) scale(1.08)",
                      zIndex: 80,
                      pointerEvents: "none",
                    }
                  : undefined;
              return (
                <button
                  key={c.id}
                  type="button"
                  className={`arena-flat-card${playable ? " is-playable" : ""}${
                    isSel ? " is-selected" : ""
                  }${isDrag ? " is-dragging" : ""}${
                    gameOver ? " is-review" : ""
                  }`}
                  style={dragStyle}
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
                      setSelected((cur) => (cur?.id === c.id ? null : c));
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
                      setSelected((cur) => (cur?.id === c.id ? null : c));
                      return;
                    }
                    if (playable) tryPlay(c);
                  }}
                  aria-label={
                    gameOver
                      ? `Inspect ${c.shape} ${c.number}`
                      : `Play ${c.shape} ${c.number}`
                  }
                >
                  <WhotCard card={c} playable={playable} selected={isSel} />
                </button>
              );
            })}
          </div>
          {/* Reserve bottom-right for future floating live chat */}
          <div className="arena-chat-reserve" aria-hidden />
          {gameOver && selected && (
            <p className="arena-inspect-hint">
              {selected.special === "whot"
                ? "WHOT 20"
                : `${SHAPE_LABEL[selected.shape]} · ${selected.number}`}
              {selected.special && selected.special !== "whot"
                ? ` · ${selected.special.replace(/_/g, " ")}`
                : ""}
            </p>
          )}
        </section>
      </div>

      {leaving && (
        <div className="arena-leave-flash" aria-hidden>
          <span>Time&apos;s up</span>
        </div>
      )}

      {/* Drawers */}
      {(chatOpen || menuOpen) && (
        <div
          className="arena-drawer-backdrop"
          onClick={() => {
            setChatOpen(false);
            setMenuOpen(false);
          }}
        />
      )}
      {chatOpen && chatContent && (
        <aside className="arena-drawer" aria-label="Chat">
          <div className="arena-drawer-head">
            <h3>Chat</h3>
            <button
              type="button"
              className="arena-icon-btn"
              onClick={() => setChatOpen(false)}
            >
              Close
            </button>
          </div>
          {chatContent}
        </aside>
      )}
      {menuOpen && (
        <aside className="arena-drawer" aria-label="Menu">
          <div className="arena-drawer-head">
            <h3>Menu</h3>
            <button
              type="button"
              className="arena-icon-btn"
              onClick={() => setMenuOpen(false)}
            >
              Close
            </button>
          </div>
          <div className="arena-menu-list">
            <Link href={backHref} onClick={() => setMenuOpen(false)}>
              ← Leave table
            </Link>
            {(showSoundToggle || vsAi || true) && (
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
            )}
            <Link href="/guide" onClick={() => setMenuOpen(false)}>
              How to play
            </Link>
            {menuExtra}
          </div>
        </aside>
      )}
    </div>
  );
}
