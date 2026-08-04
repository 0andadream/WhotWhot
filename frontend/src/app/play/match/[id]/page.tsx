"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SiteNav } from "@/components/SiteNav";
import { GameBoard } from "@/components/GameBoard";
import { useAccount } from "wagmi";
import { useEscrowActions, useMatch } from "@/hooks/useEscrow";
import { MatchStatus } from "@/lib/contracts";
import { createGame, reduce } from "@/lib/whot/engine";
import type { GameAction, GameState, PlayerId } from "@/lib/whot/types";
import {
  getMatchNames,
  getSavedDisplayName,
  setMatchPlayerName,
} from "@/lib/displayName";
import { getProfile } from "@/lib/profile";
import { useMatchProfiles } from "@/hooks/useMatchProfiles";
import { ProfileAvatar } from "@/components/ProfileAvatar";
import {
  fetchRelayMoves,
  loadLocalRelay,
  postRelayMove,
  pushRelayReplace,
  saveLocalRelay,
} from "@/lib/matchRelayClient";
import {
  isMoveSoundMuted,
  playOpponentMoveSound,
  setMoveSoundMuted,
  unlockMoveSound,
} from "@/lib/moveSound";
import { MatchChat } from "@/components/MatchChat";
import type { Address } from "viem";

function rebuildGame(
  seed: string,
  p1: string,
  p2: string,
  actions: GameAction[]
): GameState {
  let s = createGame(seed, p1, p2);
  for (const a of actions) {
    s = reduce(s, a);
  }
  return s;
}

function ShareWaitingMatch({ matchId }: { matchId: string }) {
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search);
      setCode((q.get("code") || "").toUpperCase());
    } catch {
      /* ignore */
    }
  }, []);

  const joinPath = code
    ? `/play/join?code=${encodeURIComponent(code)}`
    : `/play/join?matchId=${matchId}`;

  const onCopy = async () => {
    try {
      const url = `${window.location.origin}${joinPath}`;
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  return (
    <p className="muted" style={{ marginTop: 12 }}>
      Share table <strong>#{matchId}</strong>
      {code ? (
        <>
          {" "}
          · code <strong style={{ color: "#fecaca" }}>{code}</strong>
        </>
      ) : null}{" "}
      with your opponent:
      <br />
      <code style={{ fontSize: "0.75rem" }}>{joinPath}</code>
      <br />
      <button
        type="button"
        className="prem-btn-ghost sm"
        style={{ marginTop: 8 }}
        onClick={() => void onCopy()}
      >
        {copied ? "Copied!" : "Copy join link"}
      </button>
    </p>
  );
}

export default function MatchPage() {
  const params = useParams();
  const matchId = useMemo(() => {
    try {
      return BigInt(String(params.id));
    } catch {
      return null;
    }
  }, [params.id]);

  const matchKey = matchId != null ? matchId.toString() : "";
  const { address } = useAccount();
  const { match, refetch } = useMatch(matchId);
  const { submitResult, isPending } = useEscrowActions();

  const [game, setGame] = useState<GameState | null>(null);
  const [actions, setActions] = useState<GameAction[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [posting, setPosting] = useState(false);
  const [p1Name, setP1Name] = useState("Host");
  const [p2Name, setP2Name] = useState("Opponent");
  const [syncing, setSyncing] = useState(false);
  const [relayOk, setRelayOk] = useState(true);
  const [relayStorage, setRelayStorage] = useState<"redis" | "memory" | null>(
    null
  );
  const [soundMuted, setSoundMuted] = useState(false);

  const postingLock = useRef(false);
  const actionsRef = useRef<GameAction[]>([]);
  actionsRef.current = actions;
  const namesRef = useRef({ p1: p1Name, p2: p2Name });
  namesRef.current = { p1: p1Name, p2: p2Name };
  const failStreak = useRef(0);
  const pollMs = useRef(3000);
  /** Last action count we already notified for (avoid chime on self / first load) */
  const notifiedLenRef = useRef(0);
  const soundReadyRef = useRef(false);

  useEffect(() => {
    setSoundMuted(isMoveSoundMuted());
  }, []);

  const humanPlayer: PlayerId | null = useMemo(() => {
    if (!match || !address) return null;
    if (match.player1.toLowerCase() === address.toLowerCase()) return "p1";
    if (match.player2.toLowerCase() === address.toLowerCase()) return "p2";
    return null;
  }, [match, address]);

  const { forAddress } = useMatchProfiles(
    matchKey || null,
    !!match &&
      (match.status === MatchStatus.Active ||
        match.status === MatchStatus.Waiting ||
        match.status === MatchStatus.Resolved)
  );

  useEffect(() => {
    if (!match || !matchKey) return;
    const stored = getMatchNames(matchKey);
    const mine =
      getProfile(address)?.username || getSavedDisplayName();

    const p1Prof = forAddress(match.player1 as string);
    const p2Prof = forAddress(match.player2 as string);

    let n1 = p1Prof?.username || stored.p1 || "Host";
    let n2 =
      p2Prof?.username ||
      stored.p2 ||
      (match.player2 !== "0x0000000000000000000000000000000000000000"
        ? "Opponent"
        : "…");

    if (humanPlayer === "p1") {
      n1 = mine || n1 || "You";
      if (mine) setMatchPlayerName(matchKey, "p1", mine);
    }
    if (humanPlayer === "p2") {
      n2 = mine || n2 || "You";
      if (mine) setMatchPlayerName(matchKey, "p2", mine);
    }

    setP1Name(n1);
    setP2Name(n2);
  }, [match, matchKey, humanPlayer, address, forAddress]);

  const applyActionList = useCallback(
    (list: GameAction[], seed: string, n1: string, n2: string) => {
      setActions(list);
      setGame(rebuildGame(seed, n1, n2, list));
      if (matchKey) saveLocalRelay(matchKey, list);
    },
    [matchKey]
  );

  /** Chime when opponent appends moves we have not heard yet */
  const maybeNotifyOpponentMoves = useCallback(
    (next: GameAction[]) => {
      const prevLen = notifiedLenRef.current;
      if (next.length <= prevLen) {
        notifiedLenRef.current = next.length;
        return;
      }
      // First sync of an existing game: adopt length without spamming chimes
      if (!soundReadyRef.current) {
        notifiedLenRef.current = next.length;
        soundReadyRef.current = true;
        return;
      }
      if (!humanPlayer) {
        notifiedLenRef.current = next.length;
        return;
      }
      const fresh = next.slice(prevLen);
      const opponentPlayed = fresh.some((a) => a.player !== humanPlayer);
      notifiedLenRef.current = next.length;
      if (opponentPlayed) {
        playOpponentMoveSound();
      }
    },
    [humanPlayer]
  );

  /** Pull shared move log from relay (both players) */
  const pullRelay = useCallback(async () => {
    if (!matchKey || !match?.gameSeed) return;
    if (match.status !== MatchStatus.Active) return;

    setSyncing(true);
    try {
      const data = await fetchRelayMoves(matchKey);
      if (data.storage) setRelayStorage(data.storage);

      let serverActions = data.actions || [];
      const local = loadLocalRelay(matchKey);

      // If this client has a longer log (POST failed earlier / other instance), push it
      if (
        address &&
        local.length > serverActions.length &&
        humanPlayer
      ) {
        try {
          const pushed = await pushRelayReplace(
            matchKey,
            address as Address,
            local
          );
          serverActions = pushed.actions || local;
          if (pushed.storage) setRelayStorage(pushed.storage);
        } catch {
          // keep longer of local/server for display
          if (local.length > serverActions.length) serverActions = local;
        }
      } else if (local.length > serverActions.length) {
        serverActions = local;
      }

      failStreak.current = 0;
      pollMs.current = 3000;
      setRelayOk(true);
      if (data.warning && data.storage === "memory") {
        setMsg(
          "Relay is temporary (no Redis) — opponent may not see moves/chat until Upstash is set on Vercel."
        );
      } else {
        // Clear sticky sync toasts once pull succeeds
        setMsg((m) =>
          m &&
          (/sync|Relay|rate limit|RPC|saved on this device|not active|Network busy/i.test(
            m
          ))
            ? null
            : m
        );
      }

      maybeNotifyOpponentMoves(serverActions);
      applyActionList(
        serverActions,
        match.gameSeed,
        namesRef.current.p1,
        namesRef.current.p2
      );
    } catch (e) {
      failStreak.current += 1;
      pollMs.current = Math.min(12_000, 3000 * Math.min(failStreak.current, 4));
      setRelayOk(false);
      console.warn("relay pull", e);
      // Keep local board; only warn after repeated failures
      const local = loadLocalRelay(matchKey);
      if (local.length > actionsRef.current.length && match.gameSeed) {
        applyActionList(
          local,
          match.gameSeed,
          namesRef.current.p1,
          namesRef.current.p2
        );
      }
      if (failStreak.current >= 2) {
        const detail =
          e instanceof Error ? e.message : "Check connection, then Refresh board.";
        setMsg(`Relay sync issue: ${detail}`);
      }
    } finally {
      setSyncing(false);
    }
  }, [
    matchKey,
    match?.gameSeed,
    match?.status,
    applyActionList,
    address,
    humanPlayer,
    maybeNotifyOpponentMoves,
  ]);

  // Unlock audio after first tap (browser autoplay policy)
  useEffect(() => {
    const unlock = () => unlockMoveSound();
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  // Reset notify baseline when switching tables
  useEffect(() => {
    notifiedLenRef.current = 0;
    soundReadyRef.current = false;
  }, [matchKey]);

  // Poll relay with adaptive interval (slower after RPC blips)
  useEffect(() => {
    if (!match || match.status !== MatchStatus.Active) return;
    let cancelled = false;
    let timer: number | undefined;

    const tick = async () => {
      if (cancelled) return;
      await pullRelay();
      if (cancelled) return;
      timer = window.setTimeout(tick, pollMs.current);
    };
    void tick();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match?.status, match?.gameSeed, matchKey]);

  /** Play card: free, no wallet. Posted to relay for opponent. */
  const onAction = useCallback(
    async (action: GameAction) => {
      if (!matchKey || !humanPlayer || !address || !match?.gameSeed) return;
      if (action.player !== humanPlayer) return;
      if (postingLock.current || posting) return;

      const before = rebuildGame(
        match.gameSeed,
        namesRef.current.p1,
        namesRef.current.p2,
        actionsRef.current
      );
      if (before.turn !== humanPlayer || before.winner) return;

      const after = reduce(before, action);
      if (
        after.turn === before.turn &&
        after.players[0].hand.length === before.players[0].hand.length &&
        after.players[1].hand.length === before.players[1].hand.length &&
        after.discard.length === before.discard.length &&
        !after.winner
      ) {
        return;
      }

      const prior = [...actionsRef.current];
      const optimistic = [...prior, action];

      postingLock.current = true;
      setPosting(true);
      unlockMoveSound();
      // Optimistic UI + local backup (survives refresh)
      applyActionList(
        optimistic,
        match.gameSeed,
        namesRef.current.p1,
        namesRef.current.p2
      );
      // Own moves: advance notify baseline so we don't chime on echo
      notifiedLenRef.current = Math.max(
        notifiedLenRef.current,
        optimistic.length
      );
      soundReadyRef.current = true;

      try {
        let data;
        try {
          data = await postRelayMove(matchKey, address as Address, action);
        } catch (first: unknown) {
          // Stale "not active" after join — refresh on-chain match then retry once
          const msg =
            first instanceof Error ? first.message : String(first || "");
          if (/not active|waiting for opponent/i.test(msg)) {
            await refetch();
            await new Promise((r) => setTimeout(r, 600));
            data = await postRelayMove(matchKey, address as Address, action);
          } else {
            throw first;
          }
        }
        setRelayOk(true);
        failStreak.current = 0;
        if (data.storage) setRelayStorage(data.storage);
        notifiedLenRef.current = Math.max(
          notifiedLenRef.current,
          (data.actions || []).length
        );
        applyActionList(
          data.actions,
          match.gameSeed,
          namesRef.current.p1,
          namesRef.current.p2
        );
        setMsg(null);
      } catch (e: unknown) {
        // Keep optimistic move locally so refresh / retry can push it
        saveLocalRelay(matchKey, optimistic);
        const detail =
          e instanceof Error
            ? e.message
            : "Could not send move. Check internet and try again.";
        // Quiet sticky banner: short message; board still works offline-local
        setMsg(
          /not active|waiting/i.test(detail)
            ? "Syncing table… try again in a second."
            : /rate limit|RPC/i.test(detail)
              ? "Network busy — move saved, retrying…"
              : `${detail}`
        );
        // Background retry without nagging
        window.setTimeout(() => {
          void (async () => {
            try {
              const data = await postRelayMove(
                matchKey,
                address as Address,
                action
              );
              applyActionList(
                data.actions,
                match.gameSeed!,
                namesRef.current.p1,
                namesRef.current.p2
              );
              setMsg(null);
              setRelayOk(true);
            } catch {
              /* pullRelay may push local later */
            }
          })();
        }, 2000);
      } finally {
        postingLock.current = false;
        setPosting(false);
      }
    },
    [
      matchKey,
      humanPlayer,
      address,
      match?.gameSeed,
      posting,
      applyActionList,
      refetch,
    ]
  );

  const [forfeitWinner, setForfeitWinner] = useState<PlayerId | null>(null);
  const settledWinner = forfeitWinner || game?.winner || null;

  const onConfirmWinner = useCallback(async () => {
    if (!match || !matchId || !address || !settledWinner || submitted) return;
    const winnerAddr =
      settledWinner === "p1"
        ? (match.player1 as Address)
        : (match.player2 as Address);
    try {
      setMsg("Confirm in wallet once. This settles the tickets.");
      await submitResult(matchId, winnerAddr);
      setSubmitted(true);
      setMsg("Result submitted. Waiting for opponent to confirm too…");
      refetch();
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : "Submit failed");
    }
  }, [
    match,
    matchId,
    address,
    settledWinner,
    submitted,
    submitResult,
    refetch,
  ]);

  const onWin = useCallback((_winner: PlayerId) => {
    setMsg("Game over. Confirm the winner below when both agree.");
  }, []);

  const onTimeoutForfeit = useCallback((winner: PlayerId) => {
    setForfeitWinner(winner);
    setMsg(
      "Time's up — you forfeit. Opponent wins. Confirm below to settle tickets."
    );
  }, []);

  if (!matchId) {
    return (
      <div className="landing-premium ds">
        <SiteNav />
        <div className="app-shell shell-wide">
          <div className="alert">Invalid match id</div>
        </div>
      </div>
    );
  }

  if (!match) {
    return (
      <div className="landing-premium ds">
        <SiteNav />
        <div className="app-shell shell-wide">
          <header className="header">
            <Link href="/play" className="btn btn-ghost btn-sm">
              ← Play
            </Link>
          </header>
          <p className="muted">Loading match…</p>
        </div>
      </div>
    );
  }

  const statusLabel =
    match.status === MatchStatus.Waiting
      ? "Waiting for opponent"
      : match.status === MatchStatus.Active
        ? "In progress"
        : match.status === MatchStatus.Resolved
          ? "Resolved. Tickets sent to the winner"
          : match.status === MatchStatus.Cancelled
            ? "Cancelled"
            : "Unknown";

  const p2Joined =
    match.player2 !== "0x0000000000000000000000000000000000000000";

  const whoseTurn =
    game && !game.winner
      ? game.turn === "p1"
        ? p1Name
        : p2Name
      : null;

  const chatName =
    getProfile(address)?.username ||
    (humanPlayer === "p1"
      ? p1Name
      : humanPlayer === "p2"
        ? p2Name
        : getSavedDisplayName() || "Player");

  const meProf =
    humanPlayer === "p1"
      ? forAddress(match.player1 as string)
      : humanPlayer === "p2"
        ? forAddress(match.player2 as string)
        : null;
  const oppProf =
    humanPlayer === "p1"
      ? forAddress(match.player2 as string)
      : humanPlayer === "p2"
        ? forAddress(match.player1 as string)
        : null;

  /* ── Live play: circular arena ── */
  if (match.status === MatchStatus.Active && game && humanPlayer) {
    return (
      <>
        <GameBoard
          seed={match.gameSeed}
          humanPlayer={humanPlayer}
          vsAi={false}
          externalState={game}
          onAction={(a) => void onAction(a)}
          onWin={onWin}
          onTimeoutForfeit={onTimeoutForfeit}
          p1Name={p1Name}
          p2Name={p2Name}
          readOnly={posting}
          stakeTickets={1}
          potTickets={2}
          ticketBalance="1 staked"
          meProfile={
            meProf
              ? {
                  username: meProf.username,
                  avatar: meProf.avatar,
                  color: meProf.color,
                }
              : undefined
          }
          oppProfile={
            oppProf
              ? {
                  username: oppProf.username,
                  avatar: oppProf.avatar,
                  color: oppProf.color,
                }
              : undefined
          }
          chatContent={
            <MatchChat
              matchId={matchKey}
              address={address}
              displayName={chatName}
              canChat
              isPlayer
            />
          }
          menuExtra={
            <>
              <Link href={`/play/match/${matchId.toString()}/tickets`}>
                Tickets &amp; results
              </Link>
              <button
                type="button"
                disabled={syncing || posting}
                onClick={() => {
                  unlockMoveSound();
                  void pullRelay();
                }}
              >
                {syncing ? "Syncing…" : "Refresh board"}
              </button>
            </>
          }
          backHref="/play"
        />
        {msg && (
          <div
            className="table-toast"
            role="status"
            style={{
              position: "fixed",
              left: "50%",
              top: 72,
              transform: "translateX(-50%)",
              zIndex: 60,
              maxWidth: "min(380px, 90vw)",
              padding: "10px 16px",
              borderRadius: 12,
              background: "rgba(18,14,12,0.92)",
              border: "1px solid rgba(255,255,255,0.12)",
              color: "#f5f0e8",
              fontSize: "0.85rem",
              fontWeight: 600,
              boxShadow: "0 12px 32px rgba(0,0,0,0.4)",
              textAlign: "center",
            }}
          >
            {msg}
            <button
              type="button"
              onClick={() => setMsg(null)}
              style={{
                marginLeft: 10,
                border: "none",
                background: "transparent",
                color: "#fecaca",
                fontWeight: 800,
                cursor: "pointer",
              }}
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        )}
        {settledWinner && (
          <button
            type="button"
            className="btn btn-primary arena-confirm"
            disabled={isPending || submitted}
            onClick={() => void onConfirmWinner()}
          >
            {submitted
              ? "Submitted — await opponent"
              : `Confirm ${settledWinner === humanPlayer ? "you won" : "opponent won"}`}
          </button>
        )}
      </>
    );
  }

  /* ── Waiting / resolved / spectator ── */
  return (
    <div className="landing-premium ds">
      <SiteNav />
      <div className="app-shell shell-wide">
        <header className="header">
          <Link href="/play" className="btn btn-ghost btn-sm">
            ← Play
          </Link>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {(match.ticket1 > 0n || match.ticket2 > 0n) && (
              <Link
                href={`/play/match/${matchId.toString()}/tickets`}
                className="btn btn-ghost btn-sm"
              >
                Tickets &amp; results
              </Link>
            )}
          </div>
        </header>

        <div className="card-panel">
          <h2 className="match-title-row">
            <span className="match-player-id">
              <ProfileAvatar
                profile={forAddress(match.player1 as string)}
                size={32}
              />
              {p1Name}
            </span>
            <span className="muted" style={{ fontWeight: 600 }}>
              vs
            </span>
            <span className="match-player-id">
              {p2Joined ? (
                <ProfileAvatar
                  profile={forAddress(match.player2 as string)}
                  size={32}
                />
              ) : null}
              {p2Joined ? p2Name : "…"}
            </span>
          </h2>
          <p className="muted">{statusLabel}</p>
          {whoseTurn && (
            <p className="muted" style={{ marginTop: 6 }}>
              Turn:{" "}
              <strong style={{ color: "var(--text)" }}>{whoseTurn}</strong>
            </p>
          )}

          {match.status === MatchStatus.Waiting && (
            <ShareWaitingMatch matchId={matchId.toString()} />
          )}

          {match.status === MatchStatus.Resolved && (
            <div className="banner win" style={{ marginTop: 12 }}>
              Match over. Both ticket NFTs went to the winner.{" "}
              <Link
                href={`/play/match/${matchId.toString()}/tickets`}
                style={{ color: "inherit", textDecoration: "underline" }}
              >
                Claim Megapot prizes on Tickets &amp; results
              </Link>
              .
            </div>
          )}
        </div>

        {msg && <div className="alert">{msg}</div>}

        <div className="match-play-row">
          <div className="match-play-main">
            {match.status === MatchStatus.Active && !humanPlayer && (
              <p className="muted">
                Spectating. Connect as a match player to act.
              </p>
            )}
            {match.status === MatchStatus.Waiting && (
              <p className="muted" style={{ marginTop: 8 }}>
                Share your table code. Chat is open for the host now.
              </p>
            )}
          </div>

          {(match.status === MatchStatus.Waiting ||
            match.status === MatchStatus.Resolved) && (
            <MatchChat
              matchId={matchKey}
              address={address}
              displayName={chatName}
              canChat
              isPlayer={!!humanPlayer}
            />
          )}
        </div>
      </div>
    </div>
  );
}
