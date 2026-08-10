import { buildDeck, PLAYABLE_SHAPES, rngFromSeed, SHAPE_LABEL, shuffle } from "./deck";
import type {
  Card,
  GameAction,
  GameState,
  PlayerId,
  Shape,
} from "./types";

const HAND_SIZE = 5;

function other(p: PlayerId): PlayerId {
  return p === "p1" ? "p2" : "p1";
}

function playerIndex(id: PlayerId): 0 | 1 {
  return id === "p1" ? 0 : 1;
}

function log(state: GameState, msg: string): GameState {
  return { ...state, log: [...state.log.slice(-40), msg] };
}

function ensureDeck(state: GameState): GameState {
  if (state.deck.length > 0) return state;
  if (state.discard.length <= 1) return state;
  const top = state.discard[state.discard.length - 1];
  const rest = state.discard.slice(0, -1);
  const rand = rngFromSeed(state.seed + ":reshuffle:" + state.log.length);
  return {
    ...state,
    deck: shuffle(rest, rand),
    discard: [top],
  };
}

function drawCards(state: GameState, who: PlayerId, n: number): GameState {
  let s = state;
  const idx = playerIndex(who);
  const hand = [...s.players[idx].hand];
  for (let i = 0; i < n; i++) {
    s = ensureDeck(s);
    if (s.deck.length === 0) break;
    const [card, ...rest] = s.deck;
    hand.push(card);
    s = { ...s, deck: rest };
  }
  const players = [...s.players] as GameState["players"];
  players[idx] = { ...players[idx], hand };
  return { ...s, players };
}

export function canPlayCard(
  card: Card,
  currentShape: Shape,
  currentNumber: number,
  pendingPenalty: GameState["pendingPenalty"]
): boolean {
  if (pendingPenalty) {
    // Can only stack same penalty type
    if (pendingPenalty.kind === "pick_two") return card.special === "pick_two";
    if (pendingPenalty.kind === "pick_three") return card.special === "pick_three";
    return false;
  }
  if (card.special === "whot") return true;
  if (card.shape === currentShape) return true;
  if (card.number === currentNumber) return true;
  return false;
}

export function legalMoves(state: GameState, player: PlayerId): Card[] {
  if (state.winner || state.turn !== player) return [];
  const hand = state.players[playerIndex(player)].hand;
  return hand.filter((c) =>
    canPlayCard(c, state.currentShape, state.currentNumber, state.pendingPenalty)
  );
}

export function createGame(
  seed: string,
  p1Name = "Player 1",
  p2Name = "Player 2"
): GameState {
  const rand = rngFromSeed(seed);
  let deck = shuffle(buildDeck(), rand);

  const p1Hand = deck.splice(0, HAND_SIZE);
  const p2Hand = deck.splice(0, HAND_SIZE);

  // Flip until non-special starter (or accept any after tries)
  let starter: Card | undefined;
  const maxTries = 20;
  for (let i = 0; i < maxTries; i++) {
    starter = deck.shift();
    if (!starter) break;
    if (!starter.special || starter.special === "whot") {
      // Prefer non-whot non-special; if whot, call circle
      break;
    }
    deck.push(starter);
    deck = shuffle(deck, rand);
    starter = undefined;
  }
  if (!starter) {
    starter = deck.shift()!;
  }

  const currentShape: Shape =
    starter.special === "whot" ? "circle" : starter.shape === "whot" ? "circle" : starter.shape;

  return {
    deck,
    discard: [starter],
    currentShape,
    currentNumber: starter.number,
    players: [
      { id: "p1", hand: p1Hand, name: p1Name },
      { id: "p2", hand: p2Hand, name: p2Name },
    ],
    turn: "p1",
    playAgain: false,
    pendingPenalty: null,
    winner: null,
    log: [`Game started. Top card: ${labelCard(starter)}. Shape: ${SHAPE_LABEL[currentShape]}.`],
    seed,
    started: true,
  };
}

function labelCard(c: Card): string {
  if (c.special === "whot") return "WHOT 20";
  return `${SHAPE_LABEL[c.shape]} ${c.number}`;
}

function applySpecial(
  state: GameState,
  card: Card,
  player: PlayerId,
  calledShape?: Shape
): GameState {
  let s = state;
  const opp = other(player);

  switch (card.special) {
    case "hold_on":
      s = log(s, `${s.players[playerIndex(player)].name} played Hold On, plays again.`);
      s = { ...s, playAgain: true };
      break;
    case "pick_two": {
      const amount = (s.pendingPenalty?.kind === "pick_two" ? s.pendingPenalty.amount : 0) + 2;
      s = {
        ...s,
        pendingPenalty: { kind: "pick_two", amount },
        playAgain: false,
      };
      s = log(s, `Pick Two! Pending: pick ${amount}.`);
      break;
    }
    case "pick_three": {
      const amount = (s.pendingPenalty?.kind === "pick_three" ? s.pendingPenalty.amount : 0) + 3;
      s = {
        ...s,
        pendingPenalty: { kind: "pick_three", amount },
        playAgain: false,
      };
      s = log(s, `Pick Three! Pending: pick ${amount}.`);
      break;
    }
    case "suspension":
      s = log(s, `Suspension! ${s.players[playerIndex(opp)].name} is skipped.`);
      s = { ...s, playAgain: true }; // same player effectively goes again after skip
      break;
    case "general_market":
      s = log(s, `General Market! ${s.players[playerIndex(opp)].name} picks 1.`);
      s = drawCards(s, opp, 1);
      s = { ...s, playAgain: false };
      break;
    case "whot": {
      const shape = calledShape && PLAYABLE_SHAPES.includes(calledShape) ? calledShape : "circle";
      s = {
        ...s,
        currentShape: shape,
        currentNumber: 20,
        playAgain: false,
      };
      s = log(s, `WHOT! ${s.players[playerIndex(player)].name} calls ${SHAPE_LABEL[shape]}.`);
      break;
    }
    default:
      s = { ...s, playAgain: false };
  }
  return s;
}

export function reduce(state: GameState, action: GameAction): GameState {
  if (state.winner) return state;

  if (action.type === "ACCEPT_PENALTY") {
    if (state.turn !== action.player || !state.pendingPenalty) return state;
    const amt = state.pendingPenalty.amount;
    let s = drawCards(state, action.player, amt);
    s = log(s, `${s.players[playerIndex(action.player)].name} picks ${amt}.`);
    s = {
      ...s,
      pendingPenalty: null,
      turn: other(action.player),
      playAgain: false,
    };
    return s;
  }

  if (action.type === "DRAW") {
    if (state.turn !== action.player) return state;
    if (state.pendingPenalty) return state; // must accept or stack
    let s = drawCards(state, action.player, 1);
    s = log(s, `${s.players[playerIndex(action.player)].name} goes to market (draws 1).`);
    s = { ...s, turn: other(action.player), playAgain: false };
    return s;
  }

  if (action.type === "PLAY_CARD") {
    if (state.turn !== action.player) return state;
    const idx = playerIndex(action.player);
    const hand = state.players[idx].hand;
    const card = hand.find((c) => c.id === action.cardId);
    if (!card) return state;
    if (!canPlayCard(card, state.currentShape, state.currentNumber, state.pendingPenalty)) {
      return state;
    }
    if (card.special === "whot" && !action.calledShape) {
      return state; // must call a shape
    }

    let s: GameState = {
      ...state,
      players: [
        state.players[0],
        state.players[1],
      ] as GameState["players"],
    };
    const newHand = hand.filter((c) => c.id !== action.cardId);
    const players = [...s.players] as GameState["players"];
    players[idx] = { ...players[idx], hand: newHand };
    s = {
      ...s,
      players,
      discard: [...s.discard, card],
      currentShape: card.special === "whot" ? s.currentShape : card.shape === "whot" ? s.currentShape : card.shape,
      currentNumber: card.number,
    };

    s = log(s, `${players[idx].name} plays ${labelCard(card)}.`);

    // Win check before specials that continue play
    if (newHand.length === 0) {
      s = { ...s, winner: action.player, pendingPenalty: null };
      s = log(s, `🎉 ${players[idx].name} wins!`);
      return s;
    }

    // Stacking: playing pick on pick clears need to apply further until opponent fails
    if (state.pendingPenalty && (card.special === "pick_two" || card.special === "pick_three")) {
      s = applySpecial(s, card, action.player, action.calledShape);
      s = { ...s, turn: other(action.player), playAgain: false };
      return s;
    }

    s = applySpecial(s, card, action.player, action.calledShape);

    if (card.special === "whot" && action.calledShape) {
      s = { ...s, currentShape: action.calledShape };
    } else if (card.special !== "whot") {
      // already set
    }

    if (s.playAgain) {
      s = { ...s, turn: action.player, playAgain: false };
    } else {
      s = { ...s, turn: other(action.player) };
    }
    return s;
  }

  return state;
}

/** Shape with the most non-Whot cards remaining in hand (control). */
function bestCallShape(hand: Card[]): Shape {
  const counts: Partial<Record<Shape, number>> = {};
  for (const c of hand) {
    if (c.shape !== "whot") counts[c.shape] = (counts[c.shape] || 0) + 1;
  }
  let best: Shape = "circle";
  let bestN = -1;
  for (const sh of PLAYABLE_SHAPES) {
    const n = counts[sh] || 0;
    if (n > bestN) {
      bestN = n;
      best = sh;
    }
  }
  return best;
}

function shapeCount(hand: Card[], shape: Shape): number {
  return hand.filter((c) => c.shape === shape && c.special !== "whot").length;
}

/**
 * House-strength AI for Agent / practice.
 * Scores legal plays with 1-ply look-ahead: dump specials, keep suit control,
 * finish hands, punish opponent — not a random first-legal-card bot.
 */
export function aiChooseAction(state: GameState, player: PlayerId): GameAction {
  const me = playerIndex(player);
  const opp = playerIndex(other(player));
  const myHand = state.players[me].hand;
  const oppHandSize = state.players[opp].hand.length;

  // ── Penalty: always stack if possible (house never eats free picks) ──
  if (state.pendingPenalty && state.turn === player) {
    const stack = legalMoves(state, player);
    if (stack.length > 0) {
      // Prefer stacking highest chain impact (pick three > pick two)
      const pick = [...stack].sort((a, b) => {
        const rank = (c: Card) =>
          c.special === "pick_three" ? 3 : c.special === "pick_two" ? 2 : 0;
        return rank(b) - rank(a);
      })[0];
      return { type: "PLAY_CARD", player, cardId: pick.id };
    }
    return { type: "ACCEPT_PENALTY", player };
  }

  const moves = legalMoves(state, player);
  if (moves.length === 0) {
    return { type: "DRAW", player };
  }

  type Cand = { action: GameAction; score: number };
  const cands: Cand[] = [];

  for (const card of moves) {
    const calledShape =
      card.special === "whot" ? bestCallShape(myHand) : undefined;
    const action: GameAction = {
      type: "PLAY_CARD",
      player,
      cardId: card.id,
      calledShape,
    };

    let score = 0;
    const handAfter = myHand.length - 1;

    // Empty hand = win
    if (handAfter === 0) score += 10_000;

    // Specials that hurt opponent or keep tempo (house edge — aggressive)
    const oppLow = oppHandSize <= 3;
    switch (card.special) {
      case "pick_three":
        score += 140 + Math.min(oppHandSize, 10) * 10 + (oppLow ? 40 : 0);
        break;
      case "pick_two":
        score += 110 + Math.min(oppHandSize, 10) * 8 + (oppLow ? 35 : 0);
        break;
      case "suspension":
        // Extra turn is strong; brutal when opp is about to win
        score += handAfter <= 2 ? 130 : oppLow ? 100 : 70;
        break;
      case "hold_on":
        score += handAfter <= 2 ? 140 : handAfter <= 3 ? 90 : 60;
        break;
      case "general_market":
        score += 70 + (oppLow ? 50 : 15);
        break;
      case "whot":
        // Save Whot for finish / control; avoid early waste
        score += handAfter <= 1 ? 120 : handAfter <= 3 ? 55 : 8;
        score += shapeCount(myHand, calledShape!) * 16;
        if (oppLow) score += 30; // seize control when they threaten
        break;
      default:
        break;
    }

    // House pressure: if opponent is low, dump any punish card first
    if (oppLow && card.special && card.special !== "whot") {
      score += 45;
    }

    // Prefer number-matches that switch shape to a suit we dominate
    if (!card.special || card.special === null) {
      const nextShape = card.shape;
      score += shapeCount(myHand, nextShape) * 8;
      // Dump singles (reduce shape diversity) when not critical
      if (shapeCount(myHand, card.shape) === 1 && handAfter > 2) score += 6;
      // Prefer higher numbers slightly (clear awkward ranks)
      score += card.number * 0.15;
      // Matching number (cross-suit) to change to our best suit
      if (card.number === state.currentNumber && card.shape !== state.currentShape) {
        score += shapeCount(myHand, card.shape) * 5 + 10;
      }
      // Matching shape keeps control if we still have that shape after play
      if (card.shape === state.currentShape) {
        score += shapeCount(myHand, card.shape) > 1 ? 12 : 4;
      }
    }

    // 1-ply look-ahead: simulate and score position
    try {
      const next = reduce(state, action);
      if (next.winner === player) {
        score += 10_000;
      } else {
        const myNext = next.players[me].hand.length;
        const oppNext = next.players[opp].hand.length;
        score += (oppNext - myNext) * 18;
        // Opponent under penalty is great for house
        if (next.pendingPenalty && next.turn === other(player)) {
          score += 55 + next.pendingPenalty.amount * 12;
        }
        // We get another turn (hold on / suspension)
        if (next.turn === player && !next.winner) {
          score += 50;
          if (myNext <= 2) score += 55;
        }
        // Opponent's upcoming turn
        if (next.turn === other(player) && !next.winner) {
          const oppMoves = legalMoves(next, other(player));
          if (oppMoves.length === 0 && !next.pendingPenalty) {
            score += 40; // they must market-draw
          }
          if (next.pendingPenalty && oppMoves.length === 0) {
            score += 70; // they must eat the pick
          }
          // Don't hand them an instant win on their next card
          for (const om of oppMoves.slice(0, 8)) {
            try {
              const oAct: GameAction =
                om.special === "whot"
                  ? {
                      type: "PLAY_CARD",
                      player: other(player),
                      cardId: om.id,
                      calledShape: bestCallShape(
                        next.players[playerIndex(other(player))].hand
                      ),
                    }
                  : {
                      type: "PLAY_CARD",
                      player: other(player),
                      cardId: om.id,
                    };
              const afterOpp = reduce(next, oAct);
              if (afterOpp.winner === other(player)) {
                score -= 250; // avoid giving them a free finish
              }
            } catch {
              /* ignore */
            }
          }
        }
        // Deny opponent finishes
        if (oppNext === 1 && myNext > 1) score -= 45;
        if (oppNext === 0) score -= 800;
        // Prefer positions where we have fewer cards than them
        if (myNext < oppNext) score += 15;
      }
    } catch {
      /* ignore bad sim */
    }

    // Tiny deterministic jitter from card id so play isn't identical every game
    let jitter = 0;
    for (let i = 0; i < card.id.length; i++) jitter += card.id.charCodeAt(i);
    score += (jitter % 7) * 0.01;

    cands.push({ action, score });
  }

  cands.sort((a, b) => b.score - a.score);
  return cands[0].action;
}

export function serializeAction(action: GameAction): string {
  return JSON.stringify(action);
}

export function parseAction(raw: string): GameAction {
  return JSON.parse(raw) as GameAction;
}
