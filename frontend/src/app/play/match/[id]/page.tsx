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
import {
  appendMatchAction,
  loadMatchActions,
} from "@/lib/matchSync";
import type { Address } from "viem";

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
  const [msg, setMsg] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [p1Name, setP1Name] = useState("Player 1");
  const [p2Name, setP2Name] = useState("Player 2");
  const gameInitRef = useRef(false);

  const humanPlayer: PlayerId | null = useMemo(() => {
    if (!match || !address) return null;
    if (match.player1.toLowerCase() === address.toLowerCase()) return "p1";
    if (match.player2.toLowerCase() === address.toLowerCase()) return "p2";
    return null;
  }, [match, address]);

  // Names: local only (never on-chain; no gas)
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

  // Init game once when match becomes Active: rebuild from local action log
  useEffect(() => {
    if (!match || match.status !== MatchStatus.Active) return;
    if (!match.gameSeed || !matchKey) return;
    if (gameInitRef.current && game) return;

    const names = getMatchNames(matchKey);
    const n1 =
      names.p1 ||
      (humanPlayer === "p1" ? getSavedDisplayName() || "You" : p1Name);
    const n2 =
      names.p2 ||
      (humanPlayer === "p2" ? getSavedDisplayName() || "You" : p2Name);

    let s = createGame(match.gameSeed, n1, n2);
    for (const action of loadMatchActions(matchKey)) {
      s = reduce(s, action);
    }
    setGame(s);
    gameInitRef.current = true;
  }, [match?.status, match?.gameSeed, matchKey, humanPlayer]);

  // Poll localStorage for opponent moves (same browser / shared storage)
  useEffect(() => {
    if (!matchKey || !match || match.status !== MatchStatus.Active) return;

    const rebuild = () => {
      if (!match.gameSeed) return;
      const names = getMatchNames(matchKey);
      let s = createGame(
        match.gameSeed,
        names.p1 || p1Name,
        names.p2 || p2Name
      );
      for (const action of loadMatchActions(matchKey)) {
        s = reduce(s, action);
      }
      setGame(s);
    };

    const onStorage = (e: StorageEvent) => {
      if (e.key === `whotwhot:moves:${matchKey}`) rebuild();
    };
    const onCustom = (e: Event) => {
      const detail = (e as CustomEvent).detail as { matchId?: string };
      if (detail?.matchId === matchKey) rebuild();
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener("whotwhot:move", onCustom);
    const interval = window.setInterval(rebuild, 2000);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("whotwhot:move", onCustom);
      window.clearInterval(interval);
    };
  }, [matchKey, match?.status, match?.gameSeed, p1Name, p2Name]);

  // Play cards offline: NO wallet fee per move
  const onAction = useCallback(
    (action: GameAction) => {
      if (!matchKey || !humanPlayer) return;
      if (action.player !== humanPlayer) return;

      setGame((s) => {
        if (!s) return s;
        return reduce(s, action);
      });
      appendMatchAction(matchKey, action);
    },
    [matchKey, humanPlayer]
  );

  // Single on-chain confirm when the game is over (user must click button)
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

  // Do NOT auto-submit on win (that spammed wallet fees)
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

  return (
    <div className="ds">
      <SiteNav />
      <div className="app-shell shell-wide">
      <header className="header">
        <Link href="/play" className="btn btn-ghost btn-sm">
          ← Play
        </Link>
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
        {match.status === MatchStatus.Active && (
          <p className="muted" style={{ marginTop: 12 }}>
            Playing is free (no gas). You only pay once to stake tickets and once
            each to confirm the winner.
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
