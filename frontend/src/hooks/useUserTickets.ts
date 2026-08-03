"use client";

import { useAccount, usePublicClient, useReadContract } from "wagmi";
import { ADDRESSES, jackpotAbi, jackpotTicketNftAbi } from "@/lib/contracts";
import { useCallback, useEffect, useMemo, useState } from "react";

export type OwnedTicket = {
  ticketId: bigint;
  drawingId: bigint;
  normals: number[];
  bonusball: number;
  /** Megapot draw for this ticket has already settled */
  drawn: boolean;
  /** Safe to stake in a new Whot match (open draw only) */
  stakeable: boolean;
};

const DRAWINGS_TO_SCAN = 14n; // current + recent past (held tickets)

/**
 * Loads Megapot tickets the connected wallet still owns.
 * Marks already-drawn NFTs so create/join cannot stake spent lottery tickets.
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

      const candidates: Omit<OwnedTicket, "drawn" | "stakeable">[] = [];
      const seen = new Set<string>();
      for (const batch of results) {
        for (const t of batch) {
          const key = t.ticketId.toString();
          if (seen.has(key)) continue;
          seen.add(key);
          candidates.push({
            ticketId: t.ticketId,
            drawingId: t.ticket?.drawingId ?? 0n,
            normals: [...(t.normals || [])].map(Number),
            bonusball: Number(t.bonusball ?? 0),
          });
        }
      }

      // Which drawings have already settled? (winningTicket != 0)
      const uniqueDrawings = [
        ...new Set(candidates.map((c) => c.drawingId.toString())),
      ].map((s) => BigInt(s));

      const drawSettled = new Map<string, boolean>();
      await Promise.all(
        uniqueDrawings.map(async (drawingId) => {
          try {
            const state = (await publicClient.readContract({
              address: ADDRESSES.jackpot,
              abi: jackpotAbi,
              functionName: "getDrawingState",
              args: [drawingId],
            })) as { winningTicket: bigint };
            drawSettled.set(
              drawingId.toString(),
              state.winningTicket !== 0n
            );
          } catch {
            // Safer: treat unknown past drawings as drawn if < current
            drawSettled.set(
              drawingId.toString(),
              drawingId < current
            );
          }
        })
      );

      const ownership = await Promise.all(
        candidates.map((c) =>
          publicClient
            .readContract({
              address: ADDRESSES.jackpotTicketNft,
              abi: jackpotTicketNftAbi,
              functionName: "ownerOf",
              args: [c.ticketId],
            })
            .then(
              (owner) =>
                (owner as string).toLowerCase() === address.toLowerCase()
            )
            .catch(() => false)
        )
      );

      const flat: OwnedTicket[] = candidates
        .filter((_, i) => ownership[i])
        .map((c) => {
          const drawn = drawSettled.get(c.drawingId.toString()) === true;
          return {
            ...c,
            drawn,
            // Only open (unsettled) drawings may be staked for Whot
            stakeable: !drawn,
          };
        });

      // Stakeable first, then newest drawing
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
  }, [address, publicClient, currentDrawingId]);

  useEffect(() => {
    void load();
  }, [load]);

  const stakeable = useMemo(
    () => tickets.filter((t) => t.stakeable),
    [tickets]
  );
  const spent = useMemo(() => tickets.filter((t) => t.drawn), [tickets]);

  return {
    tickets,
    /** Only tickets for an open Megapot draw — safe to stake */
    stakeableTickets: stakeable,
    /** Already drawn; still in wallet but not stakeable */
    spentTickets: spent,
    loading,
    error,
    count: tickets.length,
    stakeableCount: stakeable.length,
    spentCount: spent.length,
    currentDrawingId:
      currentDrawingId !== undefined ? (currentDrawingId as bigint) : null,
    refetch: async () => {
      await refetchDrawing();
      await load();
    },
  };
}
