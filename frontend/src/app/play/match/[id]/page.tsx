"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SiteNav } from "@/components/SiteNav";
import { GameBoard } from "@/components/GameBoard";
import { MatchTicketsPanel } from "@/components/MatchTicketsPanel";
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
import { fetchRelayMoves, postRelayMove } from "@/lib/matchRelayClient";
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
  const { submitResult, cancelActive, isPending } = useEscrowActions();

  const [game, setGame] = useState<GameState | null>(null);
  const [actions, setActions] = useState<GameAction[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [posting, setPosting] = useState(false);
  const [p1Name, setP1Name] = useState("Host");
  const [p2Name, setP2Name] = useState("Opponent");
  const [syncing, setSyncing] = useState(false);
  const [relayOk, setRelayOk] = useState(true);

  const postingLock = useRef(false);
  const actionsRef = useRef<GameAction[]>([]);
  actionsRef.current = actions;
  const namesRef = useRef({ p1: p1Name, p2: p2Name });
  namesRef.current = { p1: p1Name, p2: p2Name };

  const humanPlayer: PlayerId | null = useMemo(() => {
    if (!match || !address) return null;
    if (match.player1.toLowerCase() === address.toLowerCase()) return "p1";
    if (match.player2.toLowerCase() === address.toLowerCase()) return "p2";
    return null;
  }, [match, address]);

  useEffect(() => {
    if (!match || !matchKey) return;
    const stored = getMatchNames(matchKey);
    const mine = getSavedDisplayName();

    let n1 = stored.p1 || "Host";
    let n2 = stored.p2 || "Opponent";

    if (humanPlayer === "p1") {
      n1 = mine || "You";
      if (mine) setMatchPlayerName(matchKey, "p1", mine);
      if (!stored.p2) n2 = "Opponent";
    }
    if (humanPlayer === "p2") {
      n2 = mine || "You";
      if (mine) setMatchPlayerName(matchKey, "p2", mine);
      if (!stored.p1) n1 = "Host";
    }

    setP1Name(n1);
    setP2Name(n2);
  }, [match, matchKey, humanPlayer]);

  const applyActionList = useCallback(
    (list: GameAction[], seed: string, n1: string, n2: string) => {
      setActions(list);
      setGame(rebuildGame(seed, n1, n2, list));
    },
    []
  );

  /** Pull shared move log from relay (both players) */
  const pullRelay = useCallback(async () => {
    if (!matchKey || !match?.gameSeed) return;
    if (match.status !== MatchStatus.Active) return;

    setSyncing(true);
    try {
      const data = await fetchRelayMoves(matchKey);
      setRelayOk(true);
      applyActionList(
        data.actions || [],
        match.gameSeed,
        namesRef.current.p1,
        namesRef.current.p2
      );
    } catch (e) {
      setRelayOk(false);
      console.warn("relay pull", e);
      // Keep current board; show soft warning once
      setMsg((m) =>
        m?.includes("Relay")
          ? m
          : "Relay sync issue. Check connection, then Refresh board."
      );
    } finally {
      setSyncing(false);
    }
  }, [matchKey, match?.gameSeed, match?.status, applyActionList]);

  // Poll relay every 1.5s so both ends stay live
  useEffect(() => {
    if (!match || match.status !== MatchStatus.Active) return;
    void pullRelay();
    const id = window.setInterval(() => void pullRelay(), 1500);
    return () => window.clearInterval(id);
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
      // Optimistic UI
      applyActionList(
        optimistic,
        match.gameSeed,
        namesRef.current.p1,
        namesRef.current.p2
      );

      try {
        const data = await postRelayMove(
          matchKey,
          address as Address,
          action
        );
        setRelayOk(true);
        applyActionList(
          data.actions,
          match.gameSeed,
          namesRef.current.p1,
          namesRef.current.p2
        );
        setMsg(null);
      } catch (e: unknown) {
        applyActionList(
          prior,
          match.gameSeed,
          namesRef.current.p1,
          namesRef.current.p2
        );
        setMsg(
          e instanceof Error
            ? e.message
            : "Could not send move. Check internet and try again."
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

  const onCancelActive = useCallback(async () => {
    if (!matchId) return;
    try {
      setMsg("Confirm cancel in wallet. Both tickets return to original stakers.");
      await cancelActive(matchId);
      setMsg("Match cancelled. Tickets returned. Claim any Megapot prizes below.");
      refetch();
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : "Cancel failed");
    }
  }, [matchId, cancelActive, refetch]);

  if (!matchId) {
    return (
      <div className="ds">
        <SiteNav />
        <div className="app-shell shell-wide">
          <div className="alert">Invalid match id</div>
        </div>
      </div>
    );
  }

  if (!match) {
    return (
      <div className="ds">
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
    <div className="ds">
      <SiteNav />
      <div className="app-shell shell-wide">
        <header className="header">
          <Link href="/play" className="btn btn-ghost btn-sm">
            ← Play
          </Link>
          {match.status === MatchStatus.Active && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={syncing || posting}
              onClick={() => void pullRelay()}
            >
              {syncing ? "Syncing…" : "Refresh board"}
            </button>
          )}
        </header>

        <div className="card-panel">
          <h2>
            {p1Name} vs {p2Joined ? p2Name : "…"}
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
          </p>

          <div className="stat-row" style={{ marginTop: 12 }}>
            <div className="stat">
              <div className="label">Player 1</div>
              <div className="value" style={{ fontSize: "1.15rem" }}>
                {p1Name}
              </div>
            </div>
            <div className="stat">
              <div className="label">Player 2</div>
              <div className="value" style={{ fontSize: "1.15rem" }}>
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
              relay. You only open the wallet to stake tickets and to confirm the
              winner at the end.
            </p>
          )}

          {match.status === MatchStatus.Resolved && (
            <div className="banner win" style={{ marginTop: 12 }}>
              Match over. Both ticket NFTs went to the winner. Claim any Megapot
              cash or free-ticket prizes in Tickets &amp; draw results.
            </div>
          )}
        </div>

        {msg && <div className="alert">{msg}</div>}

        {/* Lottery results first: independent of Whot finish; easy to find */}
        {(match.ticket1 > 0n || match.ticket2 > 0n) && (
          <MatchTicketsPanel
            match={{
              ticket1: match.ticket1,
              ticket2: match.ticket2,
              player1: match.player1 as Address,
              player2: match.player2 as Address,
              status: match.status,
              startedAt: match.startedAt,
              player1Result: match.player1Result as Address | undefined,
              player2Result: match.player2Result as Address | undefined,
            }}
            matchId={matchId}
            address={address}
            p1Name={p1Name}
            p2Name={p2Name}
            onCancelActive={onCancelActive}
            cancelPending={isPending}
          />
        )}

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
              disabled={isPending || submitted}
              onClick={() => void onConfirmWinner()}
            >
              {submitted
                ? "Submitted. Await opponent"
                : `Confirm ${game.winner === humanPlayer ? "you won" : "opponent won"}`}
            </button>
          )}

        {match.status === MatchStatus.Active && !humanPlayer && (
          <p className="muted">Spectating. Connect as a match player to act.</p>
        )}
      </div>
    </div>
  );
}
