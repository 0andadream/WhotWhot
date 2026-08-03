"use client";

import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
  usePublicClient,
} from "wagmi";
import { ADDRESSES, erc721Abi, MatchStatus, whotEscrowAbi } from "@/lib/contracts";
import { useCallback } from "react";
import type { Address } from "viem";

const escrowReady =
  ADDRESSES.whotEscrow !== "0x0000000000000000000000000000000000000000";

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
      refetchInterval: 10_000,
    },
  });
  return { matchIds: (data as bigint[] | undefined) ?? [], refetch, isLoading };
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
      refetchInterval: 5_000,
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
   * Megapot NFT may not be enumerable — UI asks user to paste token id,
   * or we scan Transfer events (heavy). For jam: user provides ticket id.
   */
  const createMatch = async (ticketId: bigint) => {
    await ensureApproval();
    return writeContractAsync({
      address: ADDRESSES.whotEscrow,
      abi: whotEscrowAbi,
      functionName: "createMatch",
      args: [ticketId],
      chainId: 8453,
    });
  };

  const createChallenge = async (ticketId: bigint, challenged: Address) => {
    await ensureApproval();
    return writeContractAsync({
      address: ADDRESSES.whotEscrow,
      abi: whotEscrowAbi,
      functionName: "createChallenge",
      args: [ticketId, challenged],
      chainId: 8453,
    });
  };

  const joinMatch = async (matchId: bigint, ticketId: bigint) => {
    await ensureApproval();
    return writeContractAsync({
      address: ADDRESSES.whotEscrow,
      abi: whotEscrowAbi,
      functionName: "joinMatch",
      args: [matchId, ticketId],
      chainId: 8453,
    });
  };

  const submitResult = async (matchId: bigint, winner: Address) => {
    return writeContractAsync({
      address: ADDRESSES.whotEscrow,
      abi: whotEscrowAbi,
      functionName: "submitResult",
      args: [matchId, winner],
      chainId: 8453,
    });
  };

  const postMove = async (matchId: bigint, payload: `0x${string}`) => {
    return writeContractAsync({
      address: ADDRESSES.whotEscrow,
      abi: whotEscrowAbi,
      functionName: "postMove",
      args: [matchId, payload],
      chainId: 8453,
    });
  };

  const cancelWaiting = async (matchId: bigint) => {
    return writeContractAsync({
      address: ADDRESSES.whotEscrow,
      abi: whotEscrowAbi,
      functionName: "cancelWaiting",
      args: [matchId],
      chainId: 8453,
    });
  };

  return {
    createMatch,
    createChallenge,
    joinMatch,
    submitResult,
    postMove,
    cancelWaiting,
    hash,
    isPending,
    confirming,
    isSuccess,
    error,
    MatchStatus,
  };
}
