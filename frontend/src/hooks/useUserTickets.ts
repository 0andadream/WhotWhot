"use client";

import { useAccount, usePublicClient, useReadContract } from "wagmi";
import { ADDRESSES, jackpotAbi, jackpotTicketNftAbi } from "@/lib/contracts";
import { useCallback, useEffect, useMemo, useState } from "react";
import { isDrawnTicketHidden } from "@/lib/seenDrawnTickets";

export type OwnedTicket = {
  ticketId: bigint;
  drawingId: bigint;
  normals: number[];
  bonusball: number;
  /** Megapot draw for this ticket has already settled */
  drawn: boolean;
  /** Safe to stake in a new Whot match (open draw only) */
  stakeable: boolean;
  /** User already viewed no-win / finished results; hide from stake UI */
  resultsSeen: boolean;
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
  /** Bump after results page marks tickets seen so lists re-filter */
  const [seenEpoch, setSeenEpoch] = useState(0);

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

      const candidates: Omit<
        OwnedTicket,
        "drawn" | "stakeable" | "resultsSeen"
      >[] = [];
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
          const resultsSeen = drawn && isDrawnTicketHidden(c.ticketId);
          return {
            ...c,
            drawn,
            // Only open (unsettled) drawings may be staked for Whot
            stakeable: !drawn,
            resultsSeen,
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
  }, [address, publicClient, currentDrawingId, seenEpoch]);

  useEffect(() => {
    void load();
  }, [load]);

  // Re-filter when results page marks no-win tickets seen (same tab or other)
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
  /** Drawn but user has not opened results yet (brief visibility) */
  const spentVisible = useMemo(
    () => tickets.filter((t) => t.drawn && !t.resultsSeen),
    [tickets]
  );
  /** Drawn and results already viewed — hide from stake UI / counts */
  const spentHidden = useMemo(
    () => tickets.filter((t) => t.drawn && t.resultsSeen),
    [tickets]
  );

  /** Tickets shown in create/join pickers and wallet badges */
  const visibleTickets = useMemo(
    () => tickets.filter((t) => t.stakeable || !t.resultsSeen),
    [tickets]
  );

  return {
    tickets,
    visibleTickets,
    /** Only tickets for an open Megapot draw — safe to stake */
    stakeableTickets: stakeable,
    /** Drawn, results not yet acknowledged on tickets page */
    spentTickets: spentVisible,
    spentHiddenCount: spentHidden.length,
    loading,
    error,
    /** Count for UI: open-draw + not-yet-seen drawn only */
    count: visibleTickets.length,
    stakeableCount: stakeable.length,
    spentCount: spentVisible.length,
    currentDrawingId:
      currentDrawingId !== undefined ? (currentDrawingId as bigint) : null,
    /** Call after marking results seen so this hook re-filters */
    notifyResultsSeen: () => setSeenEpoch((n) => n + 1),
    refetch: async () => {
      await refetchDrawing();
      await load();
    },
  };
}
