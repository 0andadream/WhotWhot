"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SiteNav } from "@/components/SiteNav";
import { GameBoard } from "@/components/GameBoard";
import { useAccount, usePublicClient, useWatchContractEvent } from "wagmi";
import { useEscrowActions, useMatch } from "@/hooks/useEscrow";
import { ADDRESSES, MatchStatus, whotEscrowAbi } from "@/lib/contracts";
import { createGame, parseAction, reduce, serializeAction } from "@/lib/whot/engine";
import type { GameAction, GameState, PlayerId } from "@/lib/whot/types";
import {
  getMatchNames,
  getSavedDisplayName,
  setMatchPlayerName,
} from "@/lib/displayName";
import {
  isGameAction,
  loadMatchActions,
  saveMatchActions,
} from "@/lib/matchSync";
import { hexToString, stringToHex, type Address, type Hex } from "viem";

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
  const [msg, setMsg] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [posting, setPosting] = useState(false);
  const [p1Name, setP1Name] = useState("Player 1");
  const [p2Name, setP2Name] = useState("Player 2");
  const [syncing, setSyncing] = useState(false);

  /** Prevent double wallet popups for the same move */
  const postingLock = useRef(false);
  const actionsRef = useRef<GameAction[]>([]);
  actionsRef.current = actions;

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

  /** Load full move history from chain (works across two wallets) */
  const pullOnChainMoves = useCallback(async () => {
    if (!matchId || !publicClient || !match?.gameSeed || !matchKey) return;
    if (match.status !== MatchStatus.Active) return;

    setSyncing(true);
    try {
      const latest = await publicClient.getBlockNumber();
      // Look back far enough for a jam match without scanning genesis
      const fromBlock = latest > 2_000_000n ? latest - 2_000_000n : 0n;

      const logs = await publicClient.getContractEvents({
        address: ADDRESSES.whotEscrow,
        abi: whotEscrowAbi,
        eventName: "MovePosted",
        args: { matchId },
        fromBlock,
        toBlock: "latest",
      });

      // Sort by block + log index for stable order
      const sorted = [...logs].sort((a, b) => {
        if (a.blockNumber !== b.blockNumber) {
          return a.blockNumber < b.blockNumber ? -1 : 1;
        }
        return Number(a.logIndex) - Number(b.logIndex);
      });

      const list: GameAction[] = [];
      for (const log of sorted) {
        try {
          const raw = JSON.parse(hexToString(log.args.payload as Hex));
          if (isGameAction(raw)) list.push(raw);
        } catch {
          /* skip non-game payloads */
        }
      }

      // Prefer longer chain log over shorter local cache
      const local = loadMatchActions(matchKey);
      const best = list.length >= local.length ? list : local;

      const names = getMatchNames(matchKey);
      applyActionList(
        best,
        match.gameSeed,
        names.p1 || p1Name,
        names.p2 || p2Name
      );
    } catch (e) {
      // Fallback: local cache only
      const local = loadMatchActions(matchKey);
      if (match.gameSeed) {
        const names = getMatchNames(matchKey);
        applyActionList(
          local,
          match.gameSeed,
          names.p1 || p1Name,
          names.p2 || p2Name
        );
      }
      console.warn("pullOnChainMoves failed", e);
    } finally {
      setSyncing(false);
    }
  }, [
    matchId,
    publicClient,
    match?.gameSeed,
    match?.status,
    matchKey,
    applyActionList,
    p1Name,
    p2Name,
  ]);

  // Initial + periodic sync so opponent sees host moves
  useEffect(() => {
    if (!match || match.status !== MatchStatus.Active) return;
    void pullOnChainMoves();
    const id = window.setInterval(() => void pullOnChainMoves(), 12_000);
    return () => window.clearInterval(id);
  }, [match?.status, match?.gameSeed, pullOnChainMoves]);

  // Live updates when either player posts a move
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

  // Play a card: update UI, then post once on-chain so the opponent can see it
  const onAction = useCallback(
    async (action: GameAction) => {
      if (!matchKey || !humanPlayer || !matchId || !match?.gameSeed) return;
      if (action.player !== humanPlayer) return;
      if (postingLock.current || posting) return;

      const before = rebuildGame(
        match.gameSeed,
        p1Name,
        p2Name,
        actionsRef.current
      );
      if (before.turn !== humanPlayer || before.winner) return;

      const after = reduce(before, action);
      // Illegal move: reduce leaves turn/hand unchanged for that player
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
      setMsg("Confirm move in wallet (so your opponent sees it)…");
      applyActionList(optimistic, match.gameSeed, p1Name, p2Name);

      try {
        const payload = stringToHex(serializeAction(action)) as Hex;
        await postMove(matchId, payload);
        setMsg(null);
        await pullOnChainMoves();
      } catch (e: unknown) {
        applyActionList(prior, match.gameSeed, p1Name, p2Name);
        setMsg(
          e instanceof Error
            ? e.message
            : "Move not sent. Rejected or failed. Try again."
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
      p1Name,
      p2Name,
      applyActionList,
      postMove,
      pullOnChainMoves,
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
              {humanPlayer &&
                game &&
                game.turn === humanPlayer &&
                " (yours)"}
              {humanPlayer &&
                game &&
                game.turn !== humanPlayer &&
                " (waiting for them)"}
            </p>
          )}

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
              Each move is posted on Base (small gas) so your opponent sees it.
              Tap <strong>Refresh board</strong> if their move does not appear.
              Winner confirm is a separate step at the end.
            </p>
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
