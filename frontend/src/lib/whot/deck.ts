import type { Card, Shape, SpecialKind } from "./types";

function specialFor(number: number, shape: Shape): SpecialKind {
  if (shape === "whot" || number === 20) return "whot";
  if (number === 1) return "hold_on";
  if (number === 2) return "pick_two";
  if (number === 5) return "pick_three";
  if (number === 8) return "suspension";
  if (number === 14) return "general_market";
  return null;
}

/**
 * Standard 54-card Nigerian Whot deck composition.
 * Circles/Triangles: 1–14 except 6,9
 * Cross/Square: 1,2,3,5,7,10,11,13,14
 * Stars: 1,2,3,4,5,7,8
 * Whot: five × 20
 */
export function buildDeck(): Card[] {
  const cards: Card[] = [];
  let n = 0;

  const add = (shape: Shape, numbers: number[]) => {
    for (const num of numbers) {
      cards.push({
        id: `${shape}-${num}-${n++}`,
        shape,
        number: num,
        special: specialFor(num, shape),
      });
    }
  };

  const circleTriangle = [1, 2, 3, 4, 5, 7, 8, 10, 11, 12, 13, 14];
  const crossSquare = [1, 2, 3, 5, 7, 10, 11, 13, 14];
  const stars = [1, 2, 3, 4, 5, 7, 8];

  add("circle", circleTriangle);
  add("triangle", circleTriangle);
  add("cross", crossSquare);
  add("square", crossSquare);
  add("star", stars);

  for (let i = 0; i < 5; i++) {
    cards.push({
      id: `whot-20-${n++}`,
      shape: "whot",
      number: 20,
      special: "whot",
    });
  }

  return cards;
}

/** Mulberry32 PRNG from hex/string seed */
export function rngFromSeed(seed: string): () => number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(31, h) + seed.charCodeAt(i);
    h |= 0;
  }
  let t = h >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(arr: T[], rand: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const SHAPE_LABEL: Record<Shape, string> = {
  circle: "Circle",
  triangle: "Triangle",
  cross: "Cross",
  square: "Square",
  star: "Star",
  whot: "Whot",
};

export const SHAPE_SYMBOL: Record<Shape, string> = {
  circle: "●",
  triangle: "▲",
  cross: "✚",
  square: "■",
  star: "★",
  whot: "W",
};

export const PLAYABLE_SHAPES: Shape[] = [
  "circle",
  "triangle",
  "cross",
  "square",
  "star",
];
