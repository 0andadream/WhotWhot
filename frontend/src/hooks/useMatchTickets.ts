"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  useAccount,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { createPublicClient, fallback, http, type Address } from "viem";
import { base } from "viem/chains";
import {
  ADDRESSES,
  jackpotAbi,
  jackpotTicketNftAbi,
  MatchStatus,
} from "@/lib/contracts";
import { baseRpcUrls } from "@/lib/baseRpcUrls";
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
  drawn: boolean;
  winNormals: number[];
  winBonus: number;
  drawingTime: number | null;
  score: BallMatch | null;
  tierId: number;
  payoutUsdc: bigint;
  prize: ReturnType<typeof prizeLabel>;
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

const CACHE_TTL_MS = 5 * 60_000;
const rowCache = new Map<string, { at: number; row: MatchTicketRow }>();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let browserClient: any = null;

/** Dedicated client with multi-RPC fallback (avoids single public RPC rate limits). */
function getTicketClient() {
  if (browserClient) return browserClient;
  browserClient = createPublicClient({
    chain: base,
    batch: { multicall: false },
    transport: fallback(
      baseRpcUrls().map((url) =>
        http(url, { timeout: 12_000, retryCount: 2, retryDelay: 350 })
      ),
      { rank: false }
    ),
  });
  return browserClient;
}

function friendlyRpcError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/rate limit|over rate/i.test(msg)) {
    return "Base RPC is busy (rate limited). Wait a few seconds and tap Refresh.";
  }
  if (msg.length > 220) return msg.slice(0, 220) + "…";
  return msg || "Could not load ticket results";
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function loadTicketRow(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  opts: {
    slot: "ticket1" | "ticket2";
    ticketId: bigint;
    staker: Address;
    viewer: Address | undefined;
    escrow: Address;
  }
): Promise<MatchTicketRow | null> {
  if (opts.ticketId === 0n) return null;

  const cacheKey = `${opts.ticketId}:${opts.viewer || ""}`;
  const cached = rowCache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    // Recompute ownership flags for current viewer/escrow
    const row = { ...cached.row };
    row.ownedByEscrow =
      !!row.owner && row.owner.toLowerCase() === opts.escrow.toLowerCase();
    row.ownedByYou =
      !!row.owner &&
      !!opts.viewer &&
      row.owner.toLowerCase() === opts.viewer.toLowerCase();
    row.claimable = row.prize.hasPrize && row.ownedByYou;
    row.staker = opts.staker;
    row.slot = opts.slot;
    return row;
  }

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
      /* keep empty */
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

  const row: MatchTicketRow = {
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

  rowCache.set(cacheKey, { at: Date.now(), row });
  return row;
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
  const [state, setState] = useState<MatchTicketsState>({
    loading: false,
    error: null,
    rows: [],
    currentDrawingId: null,
    claimableIds: [],
    anyPrize: false,
    lockedInEscrow: false,
  });
  const loadingRef = useRef(false);

  const load = useCallback(
    async (opts?: { force?: boolean }) => {
      if (!match) {
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
      if (loadingRef.current) return;
      loadingRef.current = true;
      setState((s) => ({ ...s, loading: true, error: null }));

      const client = getTicketClient();
      const escrow = ADDRESSES.whotEscrow;

      if (opts?.force) {
        // Drop cache for these ticket ids
        for (const id of [match.ticket1, match.ticket2]) {
          if (id === 0n) continue;
          for (const key of [...rowCache.keys()]) {
            if (key.startsWith(`${id}:`)) rowCache.delete(key);
          }
        }
      }

      try {
        // Sequential loads + small gap to avoid burst rate limits
        const r1 = await loadTicketRow(client, {
          slot: "ticket1",
          ticketId: match.ticket1,
          staker: match.player1,
          viewer: address,
          escrow,
        });
        await sleep(200);
        const r2 = await loadTicketRow(client, {
          slot: "ticket2",
          ticketId: match.ticket2,
          staker: match.player2,
          viewer: address,
          escrow,
        });

        let cur: bigint | null = null;
        try {
          cur = (await client.readContract({
            address: ADDRESSES.jackpot,
            abi: jackpotAbi,
            functionName: "currentDrawingId",
          })) as bigint;
        } catch {
          cur = null;
        }

        const rows = [r1, r2].filter(Boolean) as MatchTicketRow[];
        const claimableIds = rows
          .filter((r) => r.claimable)
          .map((r) => r.ticketId);
        const anyPrize = rows.some((r) => r.prize.hasPrize);
        const lockedInEscrow = rows.some((r) => r.ownedByEscrow);

        setState({
          loading: false,
          error: null,
          rows,
          currentDrawingId: cur,
          claimableIds,
          anyPrize,
          lockedInEscrow,
        });
      } catch (e: unknown) {
        setState((s) => ({
          ...s,
          loading: false,
          // Keep previous rows if we had them
          error: friendlyRpcError(e),
        }));
      } finally {
        loadingRef.current = false;
      }
    },
    [match, address]
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (
      match?.status === MatchStatus.Resolved ||
      match?.status === MatchStatus.Cancelled
    ) {
      const t = window.setTimeout(() => void load({ force: true }), 2500);
      return () => window.clearTimeout(t);
    }
  }, [match?.status, load]);

  return {
    ...state,
    refetch: () => load({ force: true }),
  };
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
