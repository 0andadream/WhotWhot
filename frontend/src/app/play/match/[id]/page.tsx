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

  const { address } = useAccount();
  const { match, refetch } = useMatch(matchId);
  const { submitResult, postMove, isPending } = useEscrowActions();
  const publicClient = usePublicClient({ chainId: 8453 });

  const [game, setGame] = useState<GameState | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const humanPlayer: PlayerId | null = useMemo(() => {
    if (!match || !address) return null;
    if (match.player1.toLowerCase() === address.toLowerCase()) return "p1";
    if (match.player2.toLowerCase() === address.toLowerCase()) return "p2";
    return null;
  }, [match, address]);

  // Init game from on-chain seed when Active
  useEffect(() => {
    if (!match || match.status !== MatchStatus.Active) return;
    if (game) return;
    const seed = match.gameSeed;
    setGame(
      createGame(
        seed,
        short(match.player1),
        short(match.player2)
      )
    );
  }, [match, game]);

  // Load historical moves for sync
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
        let s = createGame(
          match.gameSeed,
          short(match.player1),
          short(match.player2)
        );
        for (const log of logs) {
          const payload = log.args.payload as Hex;
          try {
            const json = hexToString(payload);
            const action = parseAction(json);
            s = reduce(s, action);
          } catch {
            /* skip bad */
          }
        }
        setGame(s);
      } catch {
        /* RPC may not support full history — local seed still works for host */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [matchId, publicClient, match?.gameSeed, match?.status]);

  useWatchContractEvent({
    address: ADDRESSES.whotEscrow,
    abi: whotEscrowAbi,
    eventName: "MovePosted",
    args: matchId != null ? { matchId } : undefined,
    chainId: 8453,
    onLogs(logs) {
      setGame((prev) => {
        if (!prev) return prev;
        let s = prev;
        for (const log of logs) {
          try {
            const payload = log.args.payload as Hex;
            const action = parseAction(hexToString(payload));
            // Avoid double-apply if we just posted
            s = reduce(s, action);
          } catch {
            /* */
          }
        }
        return s;
      });
    },
  });

  const onAction = useCallback(
    async (action: GameAction) => {
      if (!matchId || !humanPlayer) return;
      if (action.player !== humanPlayer) return;

      // Optimistic local update
      setGame((s) => (s ? reduce(s, action) : s));

      try {
        const payload = stringToHex(serializeAction(action)) as Hex;
        await postMove(matchId, payload);
      } catch (e: unknown) {
        setMsg(e instanceof Error ? e.message : "Move tx failed");
        // Reload from chain would be ideal; keep optimistic for jam
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
      <div className="app-shell">
        <div className="alert">Invalid match id</div>
      </div>
    );
  }

  if (!match) {
    return (
      <div className="app-shell">
        <header className="header">
          <Link href="/" className="btn btn-ghost connect-btn">
            ← Lobby
          </Link>
          <ConnectButton />
        </header>
        <p className="muted">Loading match #{matchId.toString()}…</p>
      </div>
    );
  }

  const statusLabel =
    match.status === MatchStatus.Waiting
      ? "Waiting for opponent"
      : match.status === MatchStatus.Active
        ? "In progress"
        : match.status === MatchStatus.Resolved
          ? "Resolved — tickets sent to winner"
          : match.status === MatchStatus.Cancelled
            ? "Cancelled"
            : "Unknown";

  return (
    <div className="app-shell">
      <header className="header">
        <Link href="/" className="btn btn-ghost connect-btn">
          ← Lobby
        </Link>
        <ConnectButton />
      </header>

      <div className="card-panel">
        <h2>Match #{matchId.toString()}</h2>
        <p className="muted">{statusLabel}</p>
        <div className="stat-row" style={{ marginTop: 10 }}>
          <div className="stat">
            <div className="label">Ticket A</div>
            <div className="value" style={{ fontSize: "1rem" }}>
              #{match.ticket1.toString()}
            </div>
            <div className="muted">{short(match.player1)}</div>
          </div>
          <div className="stat">
            <div className="label">Ticket B</div>
            <div className="value" style={{ fontSize: "1rem" }}>
              {match.ticket2 ? `#${match.ticket2.toString()}` : "—"}
            </div>
            <div className="muted">
              {match.player2 !== "0x0000000000000000000000000000000000000000"
                ? short(match.player2)
                : "Waiting…"}
            </div>
          </div>
        </div>
        {match.status === MatchStatus.Waiting && (
          <p className="muted" style={{ marginTop: 10 }}>
            Share match id <strong>{matchId.toString()}</strong> with your
            opponent, or send link:
            <br />
            <code style={{ fontSize: "0.75rem" }}>
              /play/join?matchId={matchId.toString()}
            </code>
          </p>
        )}
        {match.status === MatchStatus.Resolved && (
          <div className="banner win" style={{ marginTop: 10 }}>
            Match resolved. Both tickets transferred to the winner.
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
          p1Name={short(match.player1)}
          p2Name={short(match.player2)}
        />
      )}

      {match.status === MatchStatus.Active && game && humanPlayer && game.winner && (
        <button
          type="button"
          className="btn btn-gold"
          disabled={isPending || submitted}
          onClick={() => onWin(game.winner!)}
        >
          {submitted ? "Submitted — await opponent" : "Confirm winner on-chain"}
        </button>
      )}

      {match.status === MatchStatus.Active && !humanPlayer && (
        <p className="muted">Spectating — connect as a match player to act.</p>
      )}
    </div>
  );
}

function short(a: string) {
  if (!a || a === "0x0000000000000000000000000000000000000000") return "—";
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}
