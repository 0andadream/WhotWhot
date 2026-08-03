/**
 * Shareable table codes → on-chain match IDs.
 * Codes are short (e.g. K7M2XP) so friends don't need the numeric id.
 */

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I

export function generateTableCode(length = 6): string {
  let out = "";
  const arr = new Uint8Array(length);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(arr);
  } else {
    for (let i = 0; i < length; i++) arr[i] = Math.floor(Math.random() * 256);
  }
  for (let i = 0; i < length; i++) {
    out += CODE_CHARS[arr[i]! % CODE_CHARS.length];
  }
  return out;
}

/** Normalize user input: strip spaces/#, uppercase */
export function normalizeTableCode(raw: string): string {
  return raw.replace(/[#\s-]/g, "").toUpperCase().trim();
}

export function isNumericMatchId(raw: string): boolean {
  return /^\d+$/.test(raw.trim());
}

/** Valid custom/generated code: 4–10 alphanumeric (no pure digits — those are match ids) */
export function isValidTableCode(raw: string): boolean {
  const c = normalizeTableCode(raw);
  if (c.length < 4 || c.length > 10) return false;
  if (/^\d+$/.test(c)) return false;
  return /^[A-Z0-9]+$/.test(c);
}

export async function registerTableCode(
  code: string,
  matchId: string
): Promise<void> {
  const res = await fetch("/api/table-code", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, matchId }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || "Could not save table code");
  }
}

export async function resolveTableCode(
  code: string
): Promise<{ matchId: string } | null> {
  const q = encodeURIComponent(normalizeTableCode(code));
  const res = await fetch(`/api/table-code?code=${q}`, { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) return null;
  const data = (await res.json()) as { matchId?: string };
  if (!data.matchId) return null;
  return { matchId: data.matchId };
}
