"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SiteNav } from "@/components/SiteNav";
import { GameBoard } from "@/components/GameBoard";
import { useAccount, usePublicClient, useWatchContractEvent } from "wagmi";
import { useEscrowActions, useMatch } from "@/hooks/useEscrow";
import { ADDRESSES, MatchStatus, whotEscrowAbi } from "@/lib/contracts";
import { createGame, reduce, serializeAction } from "@/lib/whot/engine";
import type { GameAction, GameState, PlayerId } from "@/lib/whot/types";
import {
  getMatchNames,
  getSavedDisplayName,
  setMatchPlayerName,
} from "@/lib/displayName";
import { loadMatchActions, saveMatchActions } from "@/lib/matchSync";
import { fetchMatchMovesOnChain } from "@/lib/fetchMatchMoves";
import { stringToHex, type Address, type Hex } from "viem";

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
  const { submitResult, postMove, isPending } = useEscrowActions();
  const publicClient = usePublicClient({ chainId: 8453 });

  const [game, setGame] = useState<GameState | null>(null);
  const [actions, setActions] = useState<GameAction[]>([]);
  const [chainMoveCount, setChainMoveCount] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [posting, setPosting] = useState(false);
  const [p1Name, setP1Name] = useState("Host");
  const [p2Name, setP2Name] = useState("Opponent");
  const [syncing, setSyncing] = useState(false);
  const [republishing, setRepublishing] = useState(false);

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

  // Names (local only)
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
      saveMatchActions(matchKey, list);
      setGame(rebuildGame(seed, n1, n2, list));
    },
    [matchKey]
  );

  /**
   * Always rebuild from on-chain moves when possible.
   * Do NOT prefer longer local logs (that desyncs host vs guest).
   */
  const pullOnChainMoves = useCallback(async () => {
    if (!matchId || !publicClient || !match?.gameSeed || !matchKey) return;
    if (match.status !== MatchStatus.Active) return;

    setSyncing(true);
    try {
      const startedAt = Number(match.startedAt || match.createdAt || 0);
      const { actions: chainActions, error } = await fetchMatchMovesOnChain(
        publicClient,
        matchId,
        startedAt || Math.floor(Date.now() / 1000) - 86400
      );

      setChainMoveCount(chainActions.length);

      if (error) {
        setMsg(`Sync warning: ${error}. Showing local moves if any.`);
        const local = loadMatchActions(matchKey);
        if (local.length) {
          applyActionList(
            local,
            match.gameSeed,
            namesRef.current.p1,
            namesRef.current.p2
          );
        } else if (!game) {
          applyActionList(
            [],
            match.gameSeed,
            namesRef.current.p1,
            namesRef.current.p2
          );
        }
        return;
      }

      // Chain is source of truth for multiplayer
      applyActionList(
        chainActions,
        match.gameSeed,
        namesRef.current.p1,
        namesRef.current.p2
      );
      setMsg(null);
    } catch (e) {
      console.warn("pullOnChainMoves", e);
      setMsg("Could not refresh board from Base. Tap Refresh again.");
    } finally {
      setSyncing(false);
    }
  }, [
    matchId,
    publicClient,
    match?.gameSeed,
    match?.status,
    match?.startedAt,
    match?.createdAt,
    matchKey,
    applyActionList,
    game,
  ]);

  // Initial + periodic sync
  useEffect(() => {
    if (!match || match.status !== MatchStatus.Active) return;
    void pullOnChainMoves();
    const id = window.setInterval(() => void pullOnChainMoves(), 10_000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match?.status, match?.gameSeed, matchId]);

  useWatchContractEvent({
    address: ADDRESSES.whotEscrow,
    abi: whotEscrowAbi,
    eventName: "MovePosted",
    args: matchId != null ? { matchId } : undefined,
    chainId: 8453,
    onLogs() {
      void pullOnChainMoves();
    },
  });

  const onAction = useCallback(
    async (action: GameAction) => {
      if (!matchKey || !humanPlayer || !matchId || !match?.gameSeed) return;
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
      setMsg("Confirm this move in your wallet so your opponent can see it…");
      applyActionList(
        optimistic,
        match.gameSeed,
        namesRef.current.p1,
        namesRef.current.p2
      );

      try {
        const payload = stringToHex(serializeAction(action)) as Hex;
        await postMove(matchId, payload);
        setMsg("Move sent. Opponent should refresh or wait a few seconds.");
        await pullOnChainMoves();
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
            : "Move not sent. Try again and confirm in the wallet."
        );
      } finally {
        postingLock.current = false;
        setPosting(false);
      }
    },
    [
      matchKey,
      humanPlayer,
      matchId,
      match?.gameSeed,
      posting,
      applyActionList,
      postMove,
      pullOnChainMoves,
    ]
  );

  /**
   * If you played while sync was broken (moves only in this browser),
   * push local-only moves onto the chain one-by-one so opponent can catch up.
   */
  const republishLocalMoves = useCallback(async () => {
    if (!matchId || !match?.gameSeed || !humanPlayer || republishing) return;
    const local = loadMatchActions(matchKey);
    if (!local.length) {
      setMsg("No local moves to push.");
      return;
    }

    setRepublishing(true);
    setMsg("Pulling chain first…");
    try {
      const startedAt = Number(match.startedAt || match.createdAt || 0);
      const { actions: chainActions } = publicClient
        ? await fetchMatchMovesOnChain(
            publicClient,
            matchId,
            startedAt || Math.floor(Date.now() / 1000) - 86400
          )
        : { actions: [] as GameAction[] };

      setChainMoveCount(chainActions.length);

      // Only post moves that extend the chain (same prefix, then extras)
      let startIdx = 0;
      if (chainActions.length > 0) {
        // If local starts the same as chain, publish from chain.length
        const prefixOk = chainActions.every(
          (a, i) => JSON.stringify(a) === JSON.stringify(local[i])
        );
        if (prefixOk && local.length > chainActions.length) {
          startIdx = chainActions.length;
        } else if (chainActions.length >= local.length) {
          setMsg(
            `Chain already has ${chainActions.length} moves. Refresh board on both phones.`
          );
          applyActionList(
            chainActions,
            match.gameSeed,
            namesRef.current.p1,
            namesRef.current.p2
          );
          return;
        } else {
          // Diverged: still try to append local moves that chain doesn't have
          // Safer: use chain as base and warn
          setMsg(
            `Board was out of sync. Loaded ${chainActions.length} on-chain moves. If you need older local-only plays, finish with cancel/timeout or restart a table.`
          );
          applyActionList(
            chainActions,
            match.gameSeed,
            namesRef.current.p1,
            namesRef.current.p2
          );
          return;
        }
      }

      const toPost = local.slice(startIdx);
      if (!toPost.length) {
        setMsg("Nothing new to push. Both sides should Refresh board.");
        applyActionList(
          chainActions.length ? chainActions : local,
          match.gameSeed,
          namesRef.current.p1,
          namesRef.current.p2
        );
        return;
      }

      for (let i = 0; i < toPost.length; i++) {
        const action = toPost[i];
        // Only push YOUR past moves (don't re-post opponent's)
        if (action.player !== humanPlayer) continue;
        setMsg(
          `Pushing your move ${i + 1}/${toPost.length}… confirm in wallet`
        );
        const payload = stringToHex(serializeAction(action)) as Hex;
        await postMove(matchId, payload);
      }

      await pullOnChainMoves();
      setMsg(
        "Moves pushed. Opponent: open this match and tap Refresh board."
      );
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : "Push failed");
    } finally {
      setRepublishing(false);
    }
  }, [
    matchId,
    match,
    humanPlayer,
    republishing,
    matchKey,
    publicClient,
    applyActionList,
    postMove,
    pullOnChainMoves,
  ]);

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

  const localCount = typeof window !== "undefined" ? loadMatchActions(matchKey).length : 0;
  const localAhead = localCount > chainMoveCount;

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
              disabled={syncing || posting || republishing}
              onClick={() => void pullOnChainMoves()}
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
              Turn: <strong style={{ color: "var(--text)" }}>{whoseTurn}</strong>
              {humanPlayer && game && game.turn === humanPlayer && " (yours)"}
              {humanPlayer &&
                game &&
                game.turn !== humanPlayer &&
                " (waiting for them)"}
            </p>
          )}
          <p className="muted" style={{ marginTop: 6, fontSize: "0.8rem" }}>
            On-chain moves: {chainMoveCount}
            {localAhead ? ` · this device had ${localCount} local (may need push)` : ""}
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
              Each play is saved on Base so both of you see the same turn. Confirm
              in your wallet when you move. Opponent: tap Refresh board after you
              move.
            </p>
          )}

          {match.status === MatchStatus.Active && localAhead && humanPlayer && (
            <div className="alert" style={{ marginTop: 12 }}>
              This device has moves that may not be on Base yet (from the earlier
              bug). Tap <strong>Push my moves to opponent</strong> once so match #
              {matchKey} can catch up.
            </div>
          )}

          {match.status === MatchStatus.Resolved && (
            <div className="banner win" style={{ marginTop: 12 }}>
              Match over. Both tickets went to the winner.
            </div>
          )}
        </div>

        {msg && <div className="alert">{msg}</div>}
        {posting && (
          <div className="banner">Sending move… confirm once in your wallet.</div>
        )}

        {match.status === MatchStatus.Active && localAhead && humanPlayer && (
          <button
            type="button"
            className="btn btn-primary"
            disabled={republishing || posting}
            onClick={() => void republishLocalMoves()}
          >
            {republishing
              ? "Pushing moves…"
              : "Push my moves to opponent"}
          </button>
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
            readOnly={posting || republishing}
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
