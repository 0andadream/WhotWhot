const NAME_KEY = "whotwhot:displayName";
const MATCH_NAMES_KEY = "whotwhot:matchNames";

export function getSavedDisplayName(): string {
  if (typeof window === "undefined") return "";
  try {
    return (localStorage.getItem(NAME_KEY) || "").trim();
  } catch {
    return "";
  }
}

export function saveDisplayName(name: string) {
  if (typeof window === "undefined") return;
  const clean = sanitizeName(name);
  try {
    if (clean) localStorage.setItem(NAME_KEY, clean);
  } catch {
    /* ignore */
  }
}

export function sanitizeName(name: string): string {
  return name.replace(/\s+/g, " ").trim().slice(0, 24);
}

type MatchNames = { p1?: string; p2?: string };

export function getMatchNames(matchId: string): MatchNames {
  if (typeof window === "undefined") return {};
  try {
    const all = JSON.parse(localStorage.getItem(MATCH_NAMES_KEY) || "{}") as Record<
      string,
      MatchNames
    >;
    return all[matchId] || {};
  } catch {
    return {};
  }
}

export function setMatchPlayerName(
  matchId: string,
  slot: "p1" | "p2",
  name: string
) {
  if (typeof window === "undefined") return;
  const clean = sanitizeName(name);
  if (!clean) return;
  try {
    const all = JSON.parse(localStorage.getItem(MATCH_NAMES_KEY) || "{}") as Record<
      string,
      MatchNames
    >;
    const prev = all[matchId] || {};
    all[matchId] = { ...prev, [slot]: clean };
    localStorage.setItem(MATCH_NAMES_KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
}

export type NameAction = {
  type: "SET_NAME";
  player: "p1" | "p2";
  name: string;
};

export function isNameAction(x: unknown): x is NameAction {
  return (
    !!x &&
    typeof x === "object" &&
    (x as NameAction).type === "SET_NAME" &&
    typeof (x as NameAction).name === "string"
  );
}
