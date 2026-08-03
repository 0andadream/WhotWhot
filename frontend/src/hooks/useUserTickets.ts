"use client";

import { useAccount, useReadContract } from "wagmi";
import {
  createPublicClient,
  fallback,
  http,
  type Address,
} from "viem";
import { base } from "viem/chains";
import { ADDRESSES, jackpotAbi, jackpotTicketNftAbi } from "@/lib/contracts";
import { baseRpcUrls } from "@/lib/baseRpcUrls";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  isDrawnTicketHidden,
  markDrawnTicketsSeen,
} from "@/lib/seenDrawnTickets";

export type OwnedTicket = {
  ticketId: bigint;
  drawingId: bigint;
  normals: number[];
  bonusball: number;
  /** Megapot draw for this ticket has already settled */
  drawn: boolean;
  /** Safe to stake in a new Whot match (current open draw only) */
  stakeable: boolean;
  /** Hidden from inventory after results seen / past draw */
  resultsSeen: boolean;
};

const DRAWINGS_TO_SCAN = 14n;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let ticketRpcClient: any = null;

function getTicketRpc() {
  if (ticketRpcClient) return ticketRpcClient;
  ticketRpcClient = createPublicClient({
    chain: base,
    batch: { multicall: false },
    transport: fallback(
      baseRpcUrls().map((url) =>
        http(url, { timeout: 12_000, retryCount: 2, retryDelay: 350 })
      ),
      { rank: false }
    ),
  });
  return ticketRpcClient;
}

function winningTicketOf(state: unknown): bigint {
  if (!state || typeof state !== "object") return 0n;
  const s = state as Record<string, unknown> & { winningTicket?: bigint };
  if (s.winningTicket !== undefined && s.winningTicket !== null) {
    return BigInt(s.winningTicket as bigint | number | string);
  }
  // tuple-style
  if (Array.isArray(state) && state[8] !== undefined) {
    return BigInt(state[8] as bigint | number | string);
  }
  return 0n;
}

/**
 * Loads Megapot tickets the connected wallet still owns.
 * Only the **current open draw** is stakeable / counted.
 * Past-draw NFTs (including no-win leftovers) never count as “1 ticket to stake”.
 */
export function useUserTickets() {
  const { address } = useAccount();
  const [tickets, setTickets] = useState<OwnedTicket[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seenEpoch, setSeenEpoch] = useState(0);

  const { data: currentDrawingId, refetch: refetchDrawing } = useReadContract({
    address: ADDRESSES.jackpot,
    abi: jackpotAbi,
    functionName: "currentDrawingId",
    chainId: 8453,
    query: { enabled: !!address, refetchInterval: 60_000 },
  });

  const load = useCallback(async () => {
    if (!address || currentDrawingId === undefined) {
      setTickets([]);
      return;
    }
    setLoading(true);
    setError(null);
    const client = getTicketRpc();
    const current = currentDrawingId as bigint;

    try {
      // Is the *current* drawing still open?
      let currentOpen = true;
      try {
        const curState = await client.readContract({
          address: ADDRESSES.jackpot,
          abi: jackpotAbi,
          functionName: "getDrawingState",
          args: [current],
        });
        currentOpen = winningTicketOf(curState) === 0n;
      } catch {
        currentOpen = true; // assume open if RPC blip
      }

      const start = current > DRAWINGS_TO_SCAN ? current - DRAWINGS_TO_SCAN : 1n;
      const drawingIds: bigint[] = [];
      for (let d = start; d <= current; d++) drawingIds.push(d);

      const results = await Promise.all(
        drawingIds.map((drawingId) =>
          client
            .readContract({
              address: ADDRESSES.jackpotTicketNft,
              abi: jackpotTicketNftAbi,
              functionName: "getUserTickets",
              args: [address as Address, drawingId],
            })
            .catch(
              () =>
                [] as readonly {
                  ticketId: bigint;
                  ticket: { drawingId: bigint };
                  normals: readonly number[];
                  bonusball: number;
                }[]
            )
        )
      );

      type Cand = {
        ticketId: bigint;
        drawingId: bigint;
        normals: number[];
        bonusball: number;
      };
      const candidates: Cand[] = [];
      const seen = new Set<string>();

      for (let i = 0; i < drawingIds.length; i++) {
        const scannedDrawing = drawingIds[i];
        const batch = results[i] || [];
        for (const t of batch) {
          const key = t.ticketId.toString();
          if (seen.has(key)) continue;
          seen.add(key);
          // Prefer on-ticket drawing id; fall back to the drawing we queried
          const fromTicket = t.ticket?.drawingId;
          const drawingId =
            fromTicket !== undefined && fromTicket !== null && fromTicket !== 0n
              ? BigInt(fromTicket)
              : scannedDrawing;
          candidates.push({
            ticketId: t.ticketId,
            drawingId,
            normals: [...(t.normals || [])].map(Number),
            bonusball: Number(t.bonusball ?? 0),
          });
        }
      }

      const ownership = await Promise.all(
        candidates.map((c) =>
          client
            .readContract({
              address: ADDRESSES.jackpotTicketNft,
              abi: jackpotTicketNftAbi,
              functionName: "ownerOf",
              args: [c.ticketId],
            })
            .then(
              (owner: string) =>
                owner.toLowerCase() === (address as string).toLowerCase()
            )
            .catch(() => false)
        )
      );

      const owned = candidates.filter((_, i) => ownership[i]);

      // Past-draw tickets: always non-stakeable; auto-hide from inventory
      const pastIds = owned
        .filter((c) => c.drawingId < current || (c.drawingId === current && !currentOpen))
        .map((c) => c.ticketId);
      if (pastIds.length) {
        markDrawnTicketsSeen(pastIds);
      }

      const flat: OwnedTicket[] = owned.map((c) => {
        const isPast =
          c.drawingId < current ||
          (c.drawingId === current && !currentOpen);
        const drawn = isPast;
        // ONLY current open-draw tickets are stakeable / counted
        const stakeable =
          c.drawingId === current && currentOpen && !drawn;
        const resultsSeen =
          drawn || isDrawnTicketHidden(c.ticketId);
        return {
          ...c,
          drawn,
          stakeable,
          resultsSeen,
        };
      });

      flat.sort((a, b) => {
        if (a.stakeable !== b.stakeable) return a.stakeable ? -1 : 1;
        if (a.drawingId !== b.drawingId)
          return a.drawingId < b.drawingId ? 1 : -1;
        return a.ticketId < b.ticketId ? 1 : -1;
      });
      setTickets(flat);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not load tickets");
      setTickets([]);
    } finally {
      setLoading(false);
    }
  }, [address, currentDrawingId, seenEpoch]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const bump = () => setSeenEpoch((n) => n + 1);
    const onStorage = (e: StorageEvent) => {
      if (e.key === "whotwhot:seenDrawnTickets") bump();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("whotwhot:seenDrawn", bump);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("whotwhot:seenDrawn", bump);
    };
  }, []);

  const stakeable = useMemo(
    () => tickets.filter((t) => t.stakeable),
    [tickets]
  );

  return {
    tickets,
    /** Only open-draw tickets — safe to stake and show as “your tickets” */
    stakeableTickets: stakeable,
    visibleTickets: stakeable,
    spentTickets: tickets.filter((t) => t.drawn && !t.resultsSeen),
    spentHiddenCount: tickets.filter((t) => t.drawn).length,
    loading,
    error,
    /** Always open-draw only (never raw NFT balance) */
    count: stakeable.length,
    stakeableCount: stakeable.length,
    spentCount: tickets.filter((t) => t.drawn).length,
    currentDrawingId:
      currentDrawingId !== undefined ? (currentDrawingId as bigint) : null,
    notifyResultsSeen: () => setSeenEpoch((n) => n + 1),
    refetch: async () => {
      await refetchDrawing();
      await load();
    },
  };
}
