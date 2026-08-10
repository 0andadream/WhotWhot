import type { Address } from "viem";
import { ADDRESSES } from "@/lib/contracts";

/**
 * Paid Play vs AI — USDC entry fee paid to the site treasury (referrer wallet).
 * Free practice remains at /play/ai?mode=free (default free via mode select).
 */

/** Whole USDC units (Base USDC has 6 decimals). Override with NEXT_PUBLIC_AI_ENTRY_USDC */
export const AI_ENTRY_USDC = Number(
  process.env.NEXT_PUBLIC_AI_ENTRY_USDC || "1"
);

/** USDC amount with 6 decimals */
export function aiEntryFeeRaw(): bigint {
  const units = Number.isFinite(AI_ENTRY_USDC) && AI_ENTRY_USDC > 0
    ? AI_ENTRY_USDC
    : 1;
  return BigInt(Math.round(units * 1e6));
}

export function aiEntryLabel(): string {
  const n = Number.isFinite(AI_ENTRY_USDC) && AI_ENTRY_USDC > 0
    ? AI_ENTRY_USDC
    : 1;
  return n === 1 ? "$1 USDC" : `$${n} USDC`;
}

/** Treasury receives entry fees (same wallet as Megapot referrer by default) */
export function aiTreasury(): Address {
  return (
    (process.env.NEXT_PUBLIC_AI_TREASURY_ADDRESS as Address | undefined) ||
    ADDRESSES.megapotReferrer
  );
}

const SESSION_PREFIX = "whotwhot:aiPaid:";
const SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2h of paid play per fee

type PaidSession = {
  address: string;
  paidAt: number;
  txHash: string;
};

export function getAiPaidSession(address: string | undefined): PaidSession | null {
  if (!address || typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(SESSION_PREFIX + address.toLowerCase());
    if (!raw) return null;
    const s = JSON.parse(raw) as PaidSession;
    if (!s?.paidAt || !s?.txHash) return null;
    if (Date.now() - s.paidAt > SESSION_TTL_MS) {
      sessionStorage.removeItem(SESSION_PREFIX + address.toLowerCase());
      return null;
    }
    if (s.address.toLowerCase() !== address.toLowerCase()) return null;
    return s;
  } catch {
    return null;
  }
}

export function setAiPaidSession(address: string, txHash: string) {
  if (typeof window === "undefined") return;
  const payload: PaidSession = {
    address: address.toLowerCase(),
    paidAt: Date.now(),
    txHash,
  };
  sessionStorage.setItem(
    SESSION_PREFIX + address.toLowerCase(),
    JSON.stringify(payload)
  );
}

export function clearAiPaidSession(address: string) {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(SESSION_PREFIX + address.toLowerCase());
}
