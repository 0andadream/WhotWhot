/**
 * Lightweight node-style smoke checks (run with ts-node or paste into console).
 * Full suite can be added with vitest later.
 */
import { createGame, reduce, legalMoves, canPlayCard } from "./engine";
import { buildDeck } from "./deck";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const deck = buildDeck();
assert(deck.length === 54, `deck size ${deck.length}`);

const g = createGame("test-seed-1", "A", "B");
assert(g.players[0].hand.length === 5, "p1 hand");
assert(g.players[1].hand.length === 5, "p2 hand");
assert(g.discard.length === 1, "starter");
assert(g.started, "started");

const moves = legalMoves(g, "p1");
// May be empty depending on seed: drawing should work
if (moves.length === 0) {
  const g2 = reduce(g, { type: "DRAW", player: "p1" });
  assert(g2.turn === "p2", "turn after draw");
  assert(g2.players[0].hand.length === 6, "drew one");
}

console.log("whot engine smoke OK");
