"use client";

import { useAccount, usePublicClient, useReadContract } from "wagmi";
import { ADDRESSES, jackpotAbi, jackpotTicketNftAbi } from "@/lib/contracts";
import { useCallback, useEffect, useState } from "react";

export type OwnedTicket = {
  ticketId: bigint;
  drawingId: bigint;
  normals: number[];
  bonusball: number;
};

const DRAWINGS_TO_SCAN = 14n; // current + recent past (held tickets)

/**
 * Loads Megapot tickets the connected wallet still owns.
 * Uses JackpotTicketNFT.getUserTickets per drawing (not enumerable ERC721).
 */
export function useUserTickets() {
  const { address } = useAccount();
  const publicClient = usePublicClient({ chainId: 8453 });
  const [tickets, setTickets] = useState<OwnedTicket[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: currentDrawingId, refetch: refetchDrawing } = useReadContract({
    address: ADDRESSES.jackpot,
    abi: jackpotAbi,
    functionName: "currentDrawingId",
    chainId: 8453,
    query: { enabled: !!address, refetchInterval: 60_000 },
  });

  const load = useCallback(async () => {
    if (!address || !publicClient || currentDrawingId === undefined) {
      setTickets([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const current = currentDrawingId as bigint;
      const start = current > DRAWINGS_TO_SCAN ? current - DRAWINGS_TO_SCAN : 1n;
      const drawingIds: bigint[] = [];
      for (let d = start; d <= current; d++) drawingIds.push(d);

      const results = await Promise.all(
        drawingIds.map((drawingId) =>
          publicClient
            .readContract({
              address: ADDRESSES.jackpotTicketNft,
              abi: jackpotTicketNftAbi,
              functionName: "getUserTickets",
              args: [address, drawingId],
            })
            .catch(() => [] as readonly {
              ticketId: bigint;
              ticket: { drawingId: bigint };
              normals: readonly number[];
              bonusball: number;
            }[])
        )
      );

      // getUserTickets is updated on transfer; double-check owner in parallel
      const candidates: OwnedTicket[] = [];
      const seen = new Set<string>();
      for (const batch of results) {
        for (const t of batch) {
          const key = t.ticketId.toString();
          if (seen.has(key)) continue;
          seen.add(key);
          candidates.push({
            ticketId: t.ticketId,
            drawingId: t.ticket?.drawingId ?? 0n,
            normals: [...(t.normals || [])],
            bonusball: Number(t.bonusball ?? 0),
          });
        }
      }

      const ownership = await Promise.all(
        candidates.map((c) =>
          publicClient
            .readContract({
              address: ADDRESSES.jackpotTicketNft,
              abi: jackpotTicketNftAbi,
              functionName: "ownerOf",
              args: [c.ticketId],
            })
            .then((owner) => (owner as string).toLowerCase() === address.toLowerCase())
            .catch(() => false)
        )
      );

      const flat = candidates.filter((_, i) => ownership[i]);
      flat.sort((a, b) => (a.ticketId < b.ticketId ? 1 : -1));
      setTickets(flat);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not load tickets");
      setTickets([]);
    } finally {
      setLoading(false);
    }
  }, [address, publicClient, currentDrawingId]);

  useEffect(() => {
    void load();
  }, [load]);

  return {
    tickets,
    loading,
    error,
    count: tickets.length,
    refetch: async () => {
      await refetchDrawing();
      await load();
    },
  };
}
