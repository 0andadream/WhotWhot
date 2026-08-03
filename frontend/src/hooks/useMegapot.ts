"use client";

import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import {
  ADDRESSES,
  erc20Abi,
  erc721Abi,
  jackpotAbi,
  randomBuyerAbi,
} from "@/lib/contracts";
import { useMemo } from "react";
import { stringToHex, parseUnits } from "viem";

export function useJackpotInfo() {
  const { data: drawingId } = useReadContract({
    address: ADDRESSES.jackpot,
    abi: jackpotAbi,
    functionName: "currentDrawingId",
    chainId: 8453,
    query: { refetchInterval: 60_000 },
  });

  const { data: state } = useReadContract({
    address: ADDRESSES.jackpot,
    abi: jackpotAbi,
    functionName: "getDrawingState",
    args: drawingId !== undefined ? [drawingId] : undefined,
    chainId: 8453,
    query: {
      enabled: drawingId !== undefined,
      refetchInterval: 60_000,
    },
  });

  return useMemo(() => {
    if (!state) {
      return {
        prizePoolUsd: null as string | null,
        ticketPriceUsd: null as string | null,
        drawingTime: null as number | null,
        ballMax: 30,
        bonusballMax: 10,
        drawingId: drawingId ?? null,
      };
    }
    const prize = Number(state.prizePool) / 1e6;
    const price = Number(state.ticketPrice) / 1e6;
    return {
      prizePoolUsd: prize.toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      }),
      ticketPriceUsd: price.toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
      }),
      drawingTime: Number(state.drawingTime),
      ballMax: state.ballMax,
      bonusballMax: state.bonusballMax,
      drawingId: drawingId ?? null,
      ticketPriceRaw: state.ticketPrice,
    };
  }, [state, drawingId]);
}

export function useTicketCount() {
  const { address } = useAccount();
  const { data, refetch, isLoading } = useReadContract({
    address: ADDRESSES.jackpotTicketNft,
    abi: erc721Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: 8453,
    query: {
      enabled: !!address,
      refetchInterval: 45_000,
    },
  });

  return {
    count: data !== undefined ? Number(data) : null,
    isLoading,
    refetch,
  };
}

export function useBuyRandomTicket() {
  const { address } = useAccount();
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const referrer = (process.env.NEXT_PUBLIC_REFERRER_ADDRESS ||
    "0x0000000000000000000000000000000000000000") as `0x${string}`;
  const source = stringToHex(process.env.NEXT_PUBLIC_SOURCE_TAG || "whotwhot", {
    size: 32,
  });

  const buy = async (ticketPrice: bigint) => {
    if (!address) throw new Error("Connect wallet");
    // Approve USDC to random buyer
    writeContract({
      address: ADDRESSES.usdc,
      abi: erc20Abi,
      functionName: "approve",
      args: [ADDRESSES.jackpotRandomTicketBuyer, ticketPrice],
      chainId: 8453,
    });
    // Note: user must click buy again after approve in simple flow: 
    // for jam we expose a two-step UI
  };

  const buyAfterApprove = () => {
    if (!address) return;
    const hasReferrer =
      referrer !== "0x0000000000000000000000000000000000000000";
    writeContract({
      address: ADDRESSES.jackpotRandomTicketBuyer,
      abi: randomBuyerAbi,
      functionName: "buyTickets",
      args: [
        1n,
        address,
        hasReferrer ? [referrer] : [],
        hasReferrer ? [parseUnits("1", 18)] : [],
        source,
      ],
      chainId: 8453,
    });
  };

  return {
    approveUsdc: buy,
    buyTicket: buyAfterApprove,
    hash,
    isPending,
    confirming,
    isSuccess,
    error,
  };
}

export function useCountdown(drawingTime: number | null) {
  // Simple derived string: component re-renders via parent interval if needed
  if (!drawingTime) return "-";
  const now = Math.floor(Date.now() / 1000);
  let left = drawingTime - now;
  if (left < 0) return "Drawing soon…";
  const h = Math.floor(left / 3600);
  left %= 3600;
  const m = Math.floor(left / 60);
  const s = left % 60;
  return `${h}h ${m}m ${s}s`;
}
