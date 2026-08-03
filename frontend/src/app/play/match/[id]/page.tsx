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
          "Move relay is using temporary memory (no Redis). Moves may not reach the other player until UPSTASH_REDIS_REST_URL is set on Vercel."
        );
      } else if (!data.warning) {
        setMsg((m) =>
          m && (m.includes("Relay") || m.includes("rate limit") || m.includes("RPC"))
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
        const data = await postRelayMove(
          matchKey,
          address as Address,
          action
        );
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
        setMsg(
          `${detail} Move saved on this device. Tap Refresh board to retry sync.`
        );
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
    ]
  );

  const onConfirmWinner = useCallback(async () => {
    if (!match || !matchId || !address || !game?.winner || submitted) return;
    const winnerAddr =
      game.winner === "p1"
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
    game?.winner,
    submitted,
    submitResult,
    refetch,
  ]);

  const onWin = useCallback((_winner: PlayerId) => {
    setMsg("Game over. Confirm the winner below when both agree.");
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
            {match.status === MatchStatus.Active && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={syncing || posting}
                onClick={() => {
                  unlockMoveSound();
                  void pullRelay();
                }}
              >
                {syncing ? "Syncing…" : "Refresh board"}
              </button>
            )}
            {match.status === MatchStatus.Active && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                title={
                  soundMuted
                    ? "Unmute opponent move sound"
                    : "Mute opponent move sound"
                }
                onClick={() => {
                  unlockMoveSound();
                  const next = !soundMuted;
                  setSoundMuted(next);
                  setMoveSoundMuted(next);
                  if (!next) playOpponentMoveSound();
                }}
              >
                {soundMuted ? "Sound off" : "Sound on"}
              </button>
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
              {humanPlayer && game && game.turn === humanPlayer && " (yours)"}
              {humanPlayer &&
                game &&
                game.turn !== humanPlayer &&
                " (waiting for them)"}
            </p>
          )}
          <p className="muted" style={{ marginTop: 6, fontSize: "0.8rem" }}>
            Moves synced: {actions.length}
            {relayOk ? "" : " · relay offline"}
            {relayStorage === "memory"
              ? " · storage: temp (set Upstash Redis on Vercel for multiplayer)"
              : relayStorage === "redis"
                ? " · storage: redis"
                : ""}
          </p>

          <div className="stat-row" style={{ marginTop: 12 }}>
            <div className="stat">
              <div className="label">Player 1</div>
              <div
                className="value match-player-id"
                style={{ fontSize: "1.05rem" }}
              >
                <ProfileAvatar
                  profile={forAddress(match.player1 as string)}
                  size={28}
                />
                {p1Name}
              </div>
            </div>
            <div className="stat">
              <div className="label">Player 2</div>
              <div
                className="value match-player-id"
                style={{ fontSize: "1.05rem" }}
              >
                {p2Joined && (
                  <ProfileAvatar
                    profile={forAddress(match.player2 as string)}
                    size={28}
                  />
                )}
                {p2Joined ? p2Name : "Waiting…"}
              </div>
            </div>
          </div>

          {match.status === MatchStatus.Waiting && (
            <p className="muted" style={{ marginTop: 12 }}>
              Share table <strong>#{matchId.toString()}</strong> with your opponent:
              <br />
              <code style={{ fontSize: "0.75rem" }}>
                /play/join?matchId={matchId.toString()}
              </code>
            </p>
          )}

          {match.status === MatchStatus.Active && (
            <p className="muted" style={{ marginTop: 12 }}>
              Card plays are free (no wallet). Both phones stay in sync over the
              relay. A short chime plays when your opponent moves (tap the board
              once if sound is blocked). You only open the wallet to stake and
              to confirm the winner at the end.
            </p>
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

          {(match.ticket1 > 0n || match.ticket2 > 0n) &&
            match.status !== MatchStatus.Resolved && (
              <p className="muted" style={{ marginTop: 12, fontSize: "0.85rem" }}>
                Lottery numbers and claims are on a separate page so they do not
                load during play.{" "}
                <Link
                  href={`/play/match/${matchId.toString()}/tickets`}
                  style={{ color: "var(--text)", textDecoration: "underline" }}
                >
                  Open tickets &amp; draw results
                </Link>
              </p>
            )}
        </div>

        {msg && <div className="alert">{msg}</div>}

        <div className="match-play-row">
          <div className="match-play-main">
            {match.status === MatchStatus.Active && game && humanPlayer && (
              <GameBoard
                seed={match.gameSeed}
                humanPlayer={humanPlayer}
                vsAi={false}
                externalState={game}
                onAction={(a) => void onAction(a)}
                onWin={onWin}
                p1Name={p1Name}
                p2Name={p2Name}
                readOnly={posting}
              />
            )}

            {match.status === MatchStatus.Active &&
              game &&
              humanPlayer &&
              game.winner && (
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ marginTop: 12 }}
                  disabled={isPending || submitted}
                  onClick={() => void onConfirmWinner()}
                >
                  {submitted
                    ? "Submitted. Await opponent"
                    : `Confirm ${game.winner === humanPlayer ? "you won" : "opponent won"}`}
                </button>
              )}

            {match.status === MatchStatus.Active && !humanPlayer && (
              <p className="muted">
                Spectating. Connect as a match player to act.
              </p>
            )}

            {match.status === MatchStatus.Waiting && (
              <p className="muted" style={{ marginTop: 8 }}>
                Chat unlocks for the host now; opponent can chat after they join.
              </p>
            )}
          </div>

          {(match.status === MatchStatus.Waiting ||
            match.status === MatchStatus.Active ||
            match.status === MatchStatus.Resolved) && (
            <MatchChat
              matchId={matchKey}
              address={address}
              displayName={
                getProfile(address)?.username ||
                (humanPlayer === "p1"
                  ? p1Name
                  : humanPlayer === "p2"
                    ? p2Name
                    : getSavedDisplayName() || "Player")
              }
              canChat={
                match.status === MatchStatus.Waiting ||
                match.status === MatchStatus.Active ||
                match.status === MatchStatus.Resolved
              }
              isPlayer={!!humanPlayer}
            />
          )}
        </div>
      </div>
    </div>
  );
}
