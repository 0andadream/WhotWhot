"use client";

import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
  usePublicClient,
} from "wagmi";
import { ADDRESSES, erc721Abi, MatchStatus, whotEscrowAbi } from "@/lib/contracts";
import { useCallback, useEffect, useState } from "react";
import type { Address } from "viem";

export { MatchStatus };

const escrowReady =
  ADDRESSES.whotEscrow !== "0x0000000000000000000000000000000000000000";

export type MatchSummary = {
  id: bigint;
  player1: Address;
  player2: Address;
  ticket1: bigint;
  ticket2: bigint;
  status: number;
  gameSeed: `0x${string}`;
  role: "host" | "guest";
};

const STATUS_LABEL: Record<number, string> = {
  [MatchStatus.Waiting]: "Waiting for opponent",
  [MatchStatus.Active]: "In progress, play now",
  [MatchStatus.Resolved]: "Finished",
  [MatchStatus.Cancelled]: "Cancelled",
};

export function statusLabel(status: number) {
  return STATUS_LABEL[status] ?? "Unknown";
}

export function useEscrowReady() {
  return escrowReady;
}

export function useOpenMatches() {
  const { data, refetch, isLoading } = useReadContract({
    address: ADDRESSES.whotEscrow,
    abi: whotEscrowAbi,
    functionName: "getOpenMatches",
    chainId: 8453,
    query: {
      enabled: escrowReady,
      refetchInterval: 20_000,
    },
  });
  return { matchIds: (data as bigint[] | undefined) ?? [], refetch, isLoading };
}

/**
 * Matches where the connected wallet is player1 or player2.
 * Split into live (Waiting/Active) vs past (Resolved/Cancelled).
 */
export function useMyMatches() {
  const { address } = useAccount();
  const publicClient = usePublicClient({ chainId: 8453 });
  const [mine, setMine] = useState<MatchSummary[]>([]);
  const [past, setPast] = useState<MatchSummary[]>([]);
  const [loading, setLoading] = useState(false);

  const { data: nextId, refetch: refetchNext } = useReadContract({
    address: ADDRESSES.whotEscrow,
    abi: whotEscrowAbi,
    functionName: "nextMatchId",
    chainId: 8453,
    query: {
      enabled: escrowReady,
      refetchInterval: 20_000,
    },
  });

  const load = useCallback(async () => {
    if (!address || !publicClient || !escrowReady || nextId === undefined) {
      setMine([]);
      setPast([]);
      return;
    }
    setLoading(true);
    try {
      const max = Number(nextId as bigint);
      if (max <= 1) {
        setMine([]);
        setPast([]);
        return;
      }
      // Scan recent matches (cap for safety; jam scale is small)
      const start = Math.max(1, max - 80);
      const ids: number[] = [];
      for (let i = start; i < max; i++) ids.push(i);

      const rows = await Promise.all(
        ids.map(async (id) => {
          try {
            const m = await publicClient.readContract({
              address: ADDRESSES.whotEscrow,
              abi: whotEscrowAbi,
              functionName: "getMatch",
              args: [BigInt(id)],
            });
            return { id: BigInt(id), m };
          } catch {
            return null;
          }
        })
      );

      const me = address.toLowerCase();
      const live: MatchSummary[] = [];
      const done: MatchSummary[] = [];
      for (const row of rows) {
        if (!row) continue;
        const m = row.m as {
          player1: Address;
          player2: Address;
          ticket1: bigint;
          ticket2: bigint;
          status: number;
          gameSeed: `0x${string}`;
        };
        const p1 = m.player1.toLowerCase();
        const p2 = m.player2.toLowerCase();
        if (p1 !== me && p2 !== me) continue;

        const summary: MatchSummary = {
          id: row.id,
          player1: m.player1,
          player2: m.player2,
          ticket1: m.ticket1,
          ticket2: m.ticket2,
          status: m.status,
          gameSeed: m.gameSeed,
          role: p1 === me ? "host" : "guest",
        };

        if (
          m.status === MatchStatus.Waiting ||
          m.status === MatchStatus.Active
        ) {
          live.push(summary);
        } else if (
          m.status === MatchStatus.Resolved ||
          m.status === MatchStatus.Cancelled
        ) {
          done.push(summary);
        }
      }
      // Newest first
      live.sort((a, b) => (a.id < b.id ? 1 : -1));
      done.sort((a, b) => (a.id < b.id ? 1 : -1));
      setMine(live);
      setPast(done);
    } finally {
      setLoading(false);
    }
  }, [address, publicClient, nextId]);

  useEffect(() => {
    void load();
  }, [load]);

  return {
    /** Waiting + Active only */
    matches: mine,
    /** Resolved + Cancelled */
    pastMatches: past,
    loading,
    refetch: async () => {
      await refetchNext();
      await load();
    },
  };
}

/** Remember match ids locally as a fast path after create/join */
export function rememberMatchId(matchId: string | number | bigint) {
  if (typeof window === "undefined") return;
  try {
    const key = "whotwhot:myMatchIds";
    const prev = JSON.parse(localStorage.getItem(key) || "[]") as string[];
    const id = String(matchId);
    const next = [id, ...prev.filter((x) => x !== id)].slice(0, 40);
    localStorage.setItem(key, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

export function useMatch(matchId: bigint | null) {
  const { data, refetch, isLoading } = useReadContract({
    address: ADDRESSES.whotEscrow,
    abi: whotEscrowAbi,
    functionName: "getMatch",
    args: matchId != null ? [matchId] : undefined,
    chainId: 8453,
    query: {
      enabled: escrowReady && matchId != null,
      // Match status rarely changes mid-game; avoid burning public RPC quota
      refetchInterval: 15_000,
    },
  });
  return { match: data, refetch, isLoading };
}

export function useEscrowActions() {
  const { address } = useAccount();
  const publicClient = usePublicClient({ chainId: 8453 });
  const { writeContractAsync, data: hash, isPending, error } = useWriteContract();
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const ensureApproval = useCallback(async () => {
    if (!address || !publicClient) throw new Error("Wallet not ready");
    const approved = await publicClient.readContract({
      address: ADDRESSES.jackpotTicketNft,
      abi: erc721Abi,
      functionName: "isApprovedForAll",
      args: [address, ADDRESSES.whotEscrow],
    });
    if (!approved) {
      await writeContractAsync({
        address: ADDRESSES.jackpotTicketNft,
        abi: erc721Abi,
        functionName: "setApprovalForAll",
        args: [ADDRESSES.whotEscrow, true],
        chainId: 8453,
      });
    }
  }, [address, publicClient, writeContractAsync]);

  /**
   * Resolve a ticketId the user owns.
   * Megapot NFT may not be enumerable: UI asks user to paste token id,
   * or we scan Transfer events (heavy). For jam: user provides ticket id.
   */
  const createMatch = useCallback(
    async (ticketId: bigint) => {
      await ensureApproval();
      return writeContractAsync({
        address: ADDRESSES.whotEscrow,
        abi: whotEscrowAbi,
        functionName: "createMatch",
        args: [ticketId],
        chainId: 8453,
      });
    },
    [ensureApproval, writeContractAsync]
  );

  const createChallenge = useCallback(
    async (ticketId: bigint, challenged: Address) => {
      await ensureApproval();
      return writeContractAsync({
        address: ADDRESSES.whotEscrow,
        abi: whotEscrowAbi,
        functionName: "createChallenge",
        args: [ticketId, challenged],
        chainId: 8453,
      });
    },
    [ensureApproval, writeContractAsync]
  );

  const joinMatch = useCallback(
    async (matchId: bigint, ticketId: bigint) => {
      await ensureApproval();
      return writeContractAsync({
        address: ADDRESSES.whotEscrow,
        abi: whotEscrowAbi,
        functionName: "joinMatch",
        args: [matchId, ticketId],
        chainId: 8453,
      });
    },
    [ensureApproval, writeContractAsync]
  );

  const submitResult = useCallback(
    async (matchId: bigint, winner: Address) => {
      return writeContractAsync({
        address: ADDRESSES.whotEscrow,
        abi: whotEscrowAbi,
        functionName: "submitResult",
        args: [matchId, winner],
        chainId: 8453,
      });
    },
    [writeContractAsync]
  );

  /** Optional: not used for gameplay (gas spam). Kept for advanced sync. */
  const postMove = useCallback(
    async (matchId: bigint, payload: `0x${string}`) => {
      return writeContractAsync({
        address: ADDRESSES.whotEscrow,
        abi: whotEscrowAbi,
        functionName: "postMove",
        args: [matchId, payload],
        chainId: 8453,
      });
    },
    [writeContractAsync]
  );

  const cancelWaiting = useCallback(
    async (matchId: bigint) => {
      return writeContractAsync({
        address: ADDRESSES.whotEscrow,
        abi: whotEscrowAbi,
        functionName: "cancelWaiting",
        args: [matchId],
        chainId: 8453,
      });
    },
    [writeContractAsync]
  );

  /** After RESULT_TIMEOUT (2h), either player can return both tickets to stakers. */
  const cancelActive = useCallback(
    async (matchId: bigint) => {
      return writeContractAsync({
        address: ADDRESSES.whotEscrow,
        abi: whotEscrowAbi,
        functionName: "cancelActive",
        args: [matchId],
        chainId: 8453,
      });
    },
    [writeContractAsync]
  );

  return {
    createMatch,
    createChallenge,
    joinMatch,
    submitResult,
    postMove,
    cancelWaiting,
    cancelActive,
    hash,
    isPending,
    confirming,
    isSuccess,
    error,
    MatchStatus,
  };
}
