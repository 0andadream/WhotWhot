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
      s = log(s, `${s.players[playerIndex(player)].name} played Hold On — plays again.`);
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

/** Simple AI: play first legal card; call most common shape in hand; else draw/accept */
export function aiChooseAction(state: GameState, player: PlayerId): GameAction {
  if (state.pendingPenalty && state.turn === player) {
    const stack = legalMoves(state, player);
    if (stack.length > 0) {
      const c = stack[0];
      return { type: "PLAY_CARD", player, cardId: c.id };
    }
    return { type: "ACCEPT_PENALTY", player };
  }

  const moves = legalMoves(state, player);
  if (moves.length === 0) {
    return { type: "DRAW", player };
  }

  // Prefer specials slightly, then any
  const sorted = [...moves].sort((a, b) => {
    const score = (c: Card) =>
      c.special === "whot" ? 3 : c.special ? 2 : c.number === state.currentNumber ? 1 : 0;
    return score(b) - score(a);
  });
  const card = sorted[0];
  if (card.special === "whot") {
    const hand = state.players[playerIndex(player)].hand;
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
    return { type: "PLAY_CARD", player, cardId: card.id, calledShape: best };
  }
  return { type: "PLAY_CARD", player, cardId: card.id };
}

export function serializeAction(action: GameAction): string {
  return JSON.stringify(action);
}

export function parseAction(raw: string): GameAction {
  return JSON.parse(raw) as GameAction;
}
