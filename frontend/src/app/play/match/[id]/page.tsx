"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ConnectButton } from "@/components/ConnectButton";
import { GameBoard } from "@/components/GameBoard";
import { useAccount, usePublicClient, useWatchContractEvent } from "wagmi";
import { useEscrowActions, useMatch } from "@/hooks/useEscrow";
import { ADDRESSES, MatchStatus, whotEscrowAbi } from "@/lib/contracts";
import {
  createGame,
  parseAction,
  reduce,
  serializeAction,
} from "@/lib/whot/engine";
import type { GameAction, GameState, PlayerId } from "@/lib/whot/types";
import {
  getMatchNames,
  getSavedDisplayName,
  isNameAction,
  saveDisplayName,
  setMatchPlayerName,
  type NameAction,
} from "@/lib/displayName";
import { hexToString, stringToHex, type Address, type Hex } from "viem";

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
  const [msg, setMsg] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [p1Name, setP1Name] = useState("Player 1");
  const [p2Name, setP2Name] = useState("Player 2");
  const [nameAnnounced, setNameAnnounced] = useState(false);

  const humanPlayer: PlayerId | null = useMemo(() => {
    if (!match || !address) return null;
    if (match.player1.toLowerCase() === address.toLowerCase()) return "p1";
    if (match.player2.toLowerCase() === address.toLowerCase()) return "p2";
    return null;
  }, [match, address]);

  // Resolve names: local storage + defaults
  useEffect(() => {
    if (!match || !matchKey) return;
    const stored = getMatchNames(matchKey);
    const mine = getSavedDisplayName();

    let n1 = stored.p1 || "Host";
    let n2 = stored.p2 || "Opponent";

    if (humanPlayer === "p1" && mine) {
      n1 = mine;
      setMatchPlayerName(matchKey, "p1", mine);
    }
    if (humanPlayer === "p2" && mine) {
      n2 = mine;
      setMatchPlayerName(matchKey, "p2", mine);
    }

    // Friendly defaults for self
    if (humanPlayer === "p1") n1 = mine || "You";
    if (humanPlayer === "p2") n2 = mine || "You";
    if (humanPlayer === "p1" && !stored.p2) n2 = "Opponent";
    if (humanPlayer === "p2" && !stored.p1) n1 = "Host";

    setP1Name(n1);
    setP2Name(n2);
  }, [match, matchKey, humanPlayer, address]);

  // Announce our name on-chain so opponent can see it (via postMove)
  useEffect(() => {
    if (!match || match.status !== MatchStatus.Active) return;
    if (!humanPlayer || !matchId || nameAnnounced) return;
    const mine = getSavedDisplayName() || "Player";
    saveDisplayName(mine);
    setMatchPlayerName(matchKey, humanPlayer, mine);
    if (humanPlayer === "p1") setP1Name(mine);
    else setP2Name(mine);

    const action: NameAction = {
      type: "SET_NAME",
      player: humanPlayer,
      name: mine,
    };
    (async () => {
      try {
        const payload = stringToHex(JSON.stringify(action)) as Hex;
        await postMove(matchId, payload);
        setNameAnnounced(true);
      } catch {
        setNameAnnounced(true); // don't loop
      }
    })();
  }, [
    match?.status,
    humanPlayer,
    matchId,
    matchKey,
    nameAnnounced,
    postMove,
  ]);

  const applyNameAction = useCallback(
    (action: NameAction) => {
      const clean = action.name.trim().slice(0, 24);
      if (!clean || !matchKey) return;
      setMatchPlayerName(matchKey, action.player, clean);
      if (action.player === "p1") setP1Name(clean);
      else setP2Name(clean);
      setGame((prev) => {
        if (!prev) return prev;
        const players = [...prev.players] as GameState["players"];
        const idx = action.player === "p1" ? 0 : 1;
        players[idx] = { ...players[idx], name: clean };
        return { ...prev, players };
      });
    },
    [matchKey]
  );

  // Init game from on-chain seed when Active
  useEffect(() => {
    if (!match || match.status !== MatchStatus.Active) return;
    if (game) return;
    const seed = match.gameSeed;
    setGame(createGame(seed, p1Name, p2Name));
  }, [match, game, p1Name, p2Name]);

  // Load historical moves + name announcements
  useEffect(() => {
    if (!matchId || !publicClient || !match || match.status !== MatchStatus.Active)
      return;
    if (!match.gameSeed) return;

    let cancelled = false;
    (async () => {
      try {
        const logs = await publicClient.getContractEvents({
          address: ADDRESSES.whotEscrow,
          abi: whotEscrowAbi,
          eventName: "MovePosted",
          args: { matchId },
          fromBlock: 0n,
          toBlock: "latest",
        });
        if (cancelled) return;

        let names = { p1: p1Name, p2: p2Name };
        const stored = getMatchNames(matchKey);
        if (stored.p1) names.p1 = stored.p1;
        if (stored.p2) names.p2 = stored.p2;

        for (const log of logs) {
          try {
            const raw = JSON.parse(hexToString(log.args.payload as Hex));
            if (isNameAction(raw)) {
              names = {
                ...names,
                [raw.player]: raw.name.trim().slice(0, 24) || names[raw.player],
              };
              setMatchPlayerName(matchKey, raw.player, names[raw.player]);
            }
          } catch {
            /* */
          }
        }
        setP1Name(names.p1);
        setP2Name(names.p2);

        let s = createGame(match.gameSeed, names.p1, names.p2);
        for (const log of logs) {
          try {
            const raw = JSON.parse(hexToString(log.args.payload as Hex));
            if (isNameAction(raw)) continue;
            s = reduce(s, parseAction(JSON.stringify(raw)));
          } catch {
            /* skip bad */
          }
        }
        setGame(s);
      } catch {
        /* RPC may not support full history */
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId, publicClient, match?.gameSeed, match?.status]);

  useWatchContractEvent({
    address: ADDRESSES.whotEscrow,
    abi: whotEscrowAbi,
    eventName: "MovePosted",
    args: matchId != null ? { matchId } : undefined,
    chainId: 8453,
    onLogs(logs) {
      for (const log of logs) {
        try {
          const raw = JSON.parse(hexToString(log.args.payload as Hex));
          if (isNameAction(raw)) {
            applyNameAction(raw);
            continue;
          }
          setGame((prev) => (prev ? reduce(prev, parseAction(JSON.stringify(raw))) : prev));
        } catch {
          /* */
        }
      }
    },
  });

  const onAction = useCallback(
    async (action: GameAction) => {
      if (!matchId || !humanPlayer) return;
      if (action.player !== humanPlayer) return;

      setGame((s) => (s ? reduce(s, action) : s));

      try {
        const payload = stringToHex(serializeAction(action)) as Hex;
        await postMove(matchId, payload);
      } catch (e: unknown) {
        setMsg(e instanceof Error ? e.message : "Move tx failed");
      }
    },
    [matchId, humanPlayer, postMove]
  );

  const onWin = useCallback(
    async (winner: PlayerId) => {
      if (!match || !matchId || !address || submitted) return;
      const winnerAddr =
        winner === "p1" ? (match.player1 as Address) : (match.player2 as Address);
      try {
        setMsg("Submitting winner on-chain…");
        await submitResult(matchId, winnerAddr);
        setSubmitted(true);
        setMsg("Result submitted. Waiting for opponent confirmation…");
        refetch();
      } catch (e: unknown) {
        setMsg(e instanceof Error ? e.message : "Submit failed");
      }
    },
    [match, matchId, address, submitted, submitResult, refetch]
  );

  if (!matchId) {
    return (
      <div className="app-shell shell-wide">
        <div className="alert">Invalid match id</div>
      </div>
    );
  }

  if (!match) {
    return (
      <div className="app-shell shell-wide">
        <header className="header">
          <Link href="/play" className="btn btn-ghost btn-sm connect-btn">
            ← Play
          </Link>
          <ConnectButton />
        </header>
        <p className="muted">Loading match…</p>
      </div>
    );
  }

  const statusLabel =
    match.status === MatchStatus.Waiting
      ? "Waiting for opponent"
      : match.status === MatchStatus.Active
        ? "In progress"
        : match.status === MatchStatus.Resolved
          ? "Resolved — tickets sent to the winner"
          : match.status === MatchStatus.Cancelled
            ? "Cancelled"
            : "Unknown";

  const p2Joined =
    match.player2 !== "0x0000000000000000000000000000000000000000";

  return (
    <div className="app-shell shell-wide">
      <header className="header">
        <Link href="/play" className="btn btn-ghost btn-sm connect-btn">
          ← Play
        </Link>
        <ConnectButton />
      </header>

      <div className="card-panel">
        <h2>
          {p1Name} vs {p2Joined ? p2Name : "…"}
        </h2>
        <p className="muted">{statusLabel}</p>

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
        {match.status === MatchStatus.Resolved && (
          <div className="banner win" style={{ marginTop: 12 }}>
            Match over. Both tickets went to the winner.
          </div>
        )}
      </div>

      {msg && <div className="alert">{msg}</div>}

      {match.status === MatchStatus.Active && game && humanPlayer && (
        <GameBoard
          seed={match.gameSeed}
          humanPlayer={humanPlayer}
          vsAi={false}
          externalState={game}
          onAction={onAction}
          onWin={onWin}
          p1Name={p1Name}
          p2Name={p2Name}
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
            onClick={() => onWin(game.winner!)}
          >
            {submitted
              ? "Submitted — await opponent"
              : "Confirm winner on-chain"}
          </button>
        )}

      {match.status === MatchStatus.Active && !humanPlayer && (
        <p className="muted">Spectating — connect as a match player to act.</p>
      )}
    </div>
  );
}
