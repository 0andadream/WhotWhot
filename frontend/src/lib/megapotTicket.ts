/** Megapot ticket helpers: short ids, draw scoring, prize labels. */

export function shortTicketId(id: bigint | string): string {
  const s = typeof id === "bigint" ? id.toString() : id;
  if (s.length <= 12) return s;
  return `${s.slice(0, 6)}…${s.slice(-4)}`;
}

export function formatUsdc(amount: bigint | number, maxFrac = 2): string {
  const n = typeof amount === "bigint" ? Number(amount) / 1e6 : amount;
  if (!Number.isFinite(n) || n <= 0) return "$0";
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: maxFrac,
  });
}

export type BallMatch = {
  normals: number[];
  bonusball: number;
  matchedNormals: number[];
  matchCount: number;
  bonusHit: boolean;
};

export function scoreTicket(
  normals: readonly number[],
  bonusball: number,
  winNormals: readonly number[],
  winBonus: number
): BallMatch {
  const winSet = new Set(winNormals.map(Number));
  const matchedNormals = normals.map(Number).filter((n) => winSet.has(n));
  return {
    normals: normals.map(Number),
    bonusball: Number(bonusball),
    matchedNormals,
    matchCount: matchedNormals.length,
    bonusHit: Number(bonusball) === Number(winBonus) && Number(winBonus) > 0,
  };
}

/**
 * Human label for a Megapot prize.
 * Cash is always claimed as USDC via Jackpot.claimWinnings.
 * Lowest paid tiers often equal ticket price ("free ticket" value).
 */
export function prizeLabel(
  tierId: number,
  payoutUsdc: bigint,
  ticketPriceUsdc: bigint | null
): {
  hasPrize: boolean;
  kind: "none" | "cash" | "free_ticket" | "pending";
  text: string;
} {
  if (tierId <= 0 || payoutUsdc <= 0n) {
    return { hasPrize: false, kind: "none", text: "No prize" };
  }
  const freeTicket =
    ticketPriceUsdc != null &&
    ticketPriceUsdc > 0n &&
    payoutUsdc === ticketPriceUsdc;
  if (freeTicket) {
    return {
      hasPrize: true,
      kind: "free_ticket",
      text: `Free ticket (${formatUsdc(payoutUsdc)})`,
    };
  }
  return {
    hasPrize: true,
    kind: "cash",
    text: `Cash ${formatUsdc(payoutUsdc)}`,
  };
}

export function shortAddr(a: string): string {
  if (!a || a.length < 10) return a || "—";
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}
