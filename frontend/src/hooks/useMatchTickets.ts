"use client";

import { useCallback, useEffect, useState } from "react";
import {
  useAccount,
  usePublicClient,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import type { Address, PublicClient } from "viem";
import {
  ADDRESSES,
  jackpotAbi,
  jackpotTicketNftAbi,
  MatchStatus,
} from "@/lib/contracts";
import {
  prizeLabel,
  scoreTicket,
  type BallMatch,
} from "@/lib/megapotTicket";

export type MatchTicketRow = {
  slot: "ticket1" | "ticket2";
  ticketId: bigint;
  staker: Address;
  owner: Address | null;
  ownedByEscrow: boolean;
  ownedByYou: boolean;
  drawingId: bigint;
  normals: number[];
  bonusball: number;
  /** Draw settled (winningTicket != 0) */
  drawn: boolean;
  winNormals: number[];
  winBonus: number;
  drawingTime: number | null;
  score: BallMatch | null;
  tierId: number;
  payoutUsdc: bigint;
  prize: ReturnType<typeof prizeLabel>;
  /** Owner can call claimWinnings */
  claimable: boolean;
};

export type MatchTicketsState = {
  loading: boolean;
  error: string | null;
  rows: MatchTicketRow[];
  currentDrawingId: bigint | null;
  claimableIds: bigint[];
  anyPrize: boolean;
  lockedInEscrow: boolean;
};

async function loadTicketRow(
  client: PublicClient,
  opts: {
    slot: "ticket1" | "ticket2";
    ticketId: bigint;
    staker: Address;
    viewer: Address | undefined;
    escrow: Address;
  }
): Promise<MatchTicketRow | null> {
  if (opts.ticketId === 0n) return null;

  let owner: Address | null = null;
  try {
    owner = (await client.readContract({
      address: ADDRESSES.jackpotTicketNft,
      abi: jackpotTicketNftAbi,
      functionName: "ownerOf",
      args: [opts.ticketId],
    })) as Address;
  } catch {
    owner = null;
  }

  const ext = (await client.readContract({
    address: ADDRESSES.jackpotTicketNft,
    abi: jackpotTicketNftAbi,
    functionName: "getExtendedTicketInfo",
    args: [opts.ticketId],
  })) as {
    ticketId: bigint;
    ticket: { drawingId: bigint; packedTicket: bigint };
    normals: readonly number[];
    bonusball: number;
  };

  const drawingId = ext.ticket.drawingId;
  const normals = [...(ext.normals || [])].map(Number);
  const bonusball = Number(ext.bonusball ?? 0);

  const state = (await client.readContract({
    address: ADDRESSES.jackpot,
    abi: jackpotAbi,
    functionName: "getDrawingState",
    args: [drawingId],
  })) as {
    ticketPrice: bigint;
    drawingTime: bigint;
    winningTicket: bigint;
  };

  const drawn = state.winningTicket !== 0n;
  let winNormals: number[] = [];
  let winBonus = 0;
  let tierId = 0;
  let payoutUsdc = 0n;
  let score: BallMatch | null = null;

  if (drawn) {
    try {
      const unpacked = (await client.readContract({
        address: ADDRESSES.jackpot,
        abi: jackpotAbi,
        functionName: "getUnpackedTicket",
        args: [drawingId, state.winningTicket],
      })) as readonly [readonly number[], number];
      winNormals = [...(unpacked[0] || [])].map(Number);
      winBonus = Number(unpacked[1] ?? 0);
      score = scoreTicket(normals, bonusball, winNormals, winBonus);
    } catch {
      /* keep empty win numbers */
    }

    try {
      const tiers = (await client.readContract({
        address: ADDRESSES.jackpot,
        abi: jackpotAbi,
        functionName: "getTicketTierIds",
        args: [[opts.ticketId]],
      })) as readonly bigint[];
      tierId = Number(tiers[0] ?? 0n);
    } catch {
      tierId = 0;
    }

    if (tierId > 0) {
      try {
        const pays = (await client.readContract({
          address: ADDRESSES.jackpot,
          abi: jackpotAbi,
          functionName: "getDrawingTierPayouts",
          args: [drawingId],
        })) as readonly bigint[];
        if (tierId < pays.length) payoutUsdc = pays[tierId] ?? 0n;
      } catch {
        payoutUsdc = 0n;
      }
    }
  }

  const prize = prizeLabel(tierId, payoutUsdc, state.ticketPrice);
  const ownedByEscrow =
    !!owner && owner.toLowerCase() === opts.escrow.toLowerCase();
  const ownedByYou =
    !!owner &&
    !!opts.viewer &&
    owner.toLowerCase() === opts.viewer.toLowerCase();
  const claimable = prize.hasPrize && ownedByYou;

  return {
    slot: opts.slot,
    ticketId: opts.ticketId,
    staker: opts.staker,
    owner,
    ownedByEscrow,
    ownedByYou,
    drawingId,
    normals,
    bonusball,
    drawn,
    winNormals,
    winBonus,
    drawingTime: Number(state.drawingTime),
    score,
    tierId,
    payoutUsdc,
    prize,
    claimable,
  };
}

/**
 * Load Megapot numbers + draw results for both tickets staked in a Whot match.
 */
export function useMatchTickets(
  match:
    | {
        ticket1: bigint;
        ticket2: bigint;
        player1: Address;
        player2: Address;
        status: number;
      }
    | null
    | undefined
) {
  const { address } = useAccount();
  const publicClient = usePublicClient({ chainId: 8453 });
  const [state, setState] = useState<MatchTicketsState>({
    loading: false,
    error: null,
    rows: [],
    currentDrawingId: null,
    claimableIds: [],
    anyPrize: false,
    lockedInEscrow: false,
  });

  const load = useCallback(async () => {
    if (!publicClient || !match) {
      setState((s) => ({
        ...s,
        loading: false,
        rows: [],
        claimableIds: [],
        anyPrize: false,
        lockedInEscrow: false,
      }));
      return;
    }
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const escrow = ADDRESSES.whotEscrow;
      const [r1, r2, cur] = await Promise.all([
        loadTicketRow(publicClient, {
          slot: "ticket1",
          ticketId: match.ticket1,
          staker: match.player1,
          viewer: address,
          escrow,
        }),
        loadTicketRow(publicClient, {
          slot: "ticket2",
          ticketId: match.ticket2,
          staker: match.player2,
          viewer: address,
          escrow,
        }),
        publicClient
          .readContract({
            address: ADDRESSES.jackpot,
            abi: jackpotAbi,
            functionName: "currentDrawingId",
          })
          .catch(() => null),
      ]);

      const rows = [r1, r2].filter(Boolean) as MatchTicketRow[];
      const claimableIds = rows.filter((r) => r.claimable).map((r) => r.ticketId);
      const anyPrize = rows.some((r) => r.prize.hasPrize);
      const lockedInEscrow = rows.some((r) => r.ownedByEscrow);

      setState({
        loading: false,
        error: null,
        rows,
        currentDrawingId: cur as bigint | null,
        claimableIds,
        anyPrize,
        lockedInEscrow,
      });
    } catch (e: unknown) {
      setState((s) => ({
        ...s,
        loading: false,
        error: e instanceof Error ? e.message : "Could not load ticket results",
      }));
    }
  }, [publicClient, match, address]);

  useEffect(() => {
    void load();
  }, [load]);

  // Refresh when match status changes (resolve / cancel moves NFTs)
  useEffect(() => {
    if (match?.status === MatchStatus.Resolved || match?.status === MatchStatus.Cancelled) {
      const t = window.setTimeout(() => void load(), 2000);
      return () => window.clearTimeout(t);
    }
  }, [match?.status, load]);

  return { ...state, refetch: load };
}

export function useClaimWinnings() {
  const { writeContractAsync, data: hash, isPending, error, reset } =
    useWriteContract();
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  });

  const claim = useCallback(
    async (ticketIds: bigint[]) => {
      if (!ticketIds.length) throw new Error("No tickets to claim");
      return writeContractAsync({
        address: ADDRESSES.jackpot,
        abi: jackpotAbi,
        functionName: "claimWinnings",
        args: [ticketIds],
        chainId: 8453,
      });
    },
    [writeContractAsync]
  );

  return {
    claim,
    hash,
    isPending,
    confirming,
    isSuccess,
    error,
    reset,
  };
}
