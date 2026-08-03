import type { PublicClient, Hex } from "viem";
import { hexToString } from "viem";
import { ADDRESSES, whotEscrowAbi } from "@/lib/contracts";
import { isGameAction } from "@/lib/matchSync";
import type { GameAction } from "@/lib/whot/types";

const CHUNK = 9_000n; // Base public RPC: max 10_000 block range

/**
 * Load all game actions for a match from MovePosted events.
 * Chunks eth_getLogs so public Base RPCs don't reject the query.
 */
export async function fetchMatchMovesOnChain(
  publicClient: PublicClient,
  matchId: bigint,
  startedAtUnix: number
): Promise<{ actions: GameAction[]; error?: string }> {
  try {
    const latest = await publicClient.getBlockNumber();
    const now = Math.floor(Date.now() / 1000);
    const ageSec = Math.max(0, now - startedAtUnix);
    // Base ~2s/block; pad generously
    const blocksAgo = BigInt(Math.min(Math.ceil(ageSec / 1.8) + 5_000, 200_000));
    let from = latest > blocksAgo ? latest - blocksAgo : 0n;
    // Never go before a sane window
    if (latest - from > 200_000n) from = latest - 200_000n;

    type Log = {
      blockNumber: bigint;
      logIndex: number;
      args: { payload?: Hex; matchId?: bigint; player?: string };
    };
    const allLogs: Log[] = [];

    for (let start = from; start <= latest; start += CHUNK + 1n) {
      const end = start + CHUNK > latest ? latest : start + CHUNK;
      try {
        const chunk = await publicClient.getContractEvents({
          address: ADDRESSES.whotEscrow,
          abi: whotEscrowAbi,
          eventName: "MovePosted",
          args: { matchId },
          fromBlock: start,
          toBlock: end,
        });
        allLogs.push(...(chunk as Log[]));
      } catch (e) {
        // try smaller steps on failure
        console.warn("log chunk failed", start.toString(), e);
      }
    }

    allLogs.sort((a, b) => {
      if (a.blockNumber !== b.blockNumber) {
        return a.blockNumber < b.blockNumber ? -1 : 1;
      }
      return Number(a.logIndex) - Number(b.logIndex);
    });

    const actions: GameAction[] = [];
    for (const log of allLogs) {
      try {
        const payload = log.args.payload as Hex;
        if (!payload) continue;
        const raw = JSON.parse(hexToString(payload));
        if (isGameAction(raw)) actions.push(raw);
      } catch {
        /* skip */
      }
    }

    return { actions };
  } catch (e) {
    return {
      actions: [],
      error: e instanceof Error ? e.message : "Could not load moves from Base",
    };
  }
}
