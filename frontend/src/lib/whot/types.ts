/** Nigerian Whot shapes (suits) */
export type Shape = "circle" | "triangle" | "cross" | "square" | "star" | "whot";

export type SpecialKind =
  | "hold_on" // 1: play again
  | "pick_two" // 2
  | "pick_three" // 5
  | "suspension" // 8: skip
  | "general_market" // 14
  | "whot" // 20: wild, call shape
  | null;

export interface Card {
  id: string;
  shape: Shape;
  number: number;
  special: SpecialKind;
}

export type PlayerId = "p1" | "p2";

export interface PlayerState {
  id: PlayerId;
  hand: Card[];
  /** Display label (wallet short or "You" / "AI") */
  name: string;
}

export interface PendingPenalty {
  kind: "pick_two" | "pick_three";
  amount: number;
}

export interface GameState {
  deck: Card[];
  discard: Card[];
  /** Active shape on top (may differ from top card after Whot call) */
  currentShape: Shape;
  currentNumber: number;
  players: [PlayerState, PlayerState];
  turn: PlayerId;
  /** Extra turn from Hold On */
  playAgain: boolean;
  pendingPenalty: PendingPenalty | null;
  winner: PlayerId | null;
  log: string[];
  seed: string;
  started: boolean;
}

export type GameAction =
  | { type: "PLAY_CARD"; player: PlayerId; cardId: string; calledShape?: Shape }
  | { type: "DRAW"; player: PlayerId }
  | { type: "ACCEPT_PENALTY"; player: PlayerId };
