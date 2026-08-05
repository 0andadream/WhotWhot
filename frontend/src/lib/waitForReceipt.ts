import {
  createPublicClient,
  fallback,
  http,
  type Hash,
  type TransactionReceipt,
} from "viem";
import { base } from "viem/chains";
import { baseRpcUrls } from "@/lib/baseRpcUrls";

type ReceiptClient = {
  getTransactionReceipt: (args: {
    hash: Hash;
  }) => Promise<TransactionReceipt>;
};

/**
 * Dedicated multi-RPC Base client for receipt polling.
 * Public endpoints often lag the wallet's node after send.
 */
function multiRpcClient(): ReceiptClient {
  const urls = baseRpcUrls();
  return createPublicClient({
    chain: base,
    transport: fallback(
      urls.map((url) =>
        http(url, {
          timeout: 15_000,
          retryCount: 1,
          retryDelay: 250,
        })
      ),
      { rank: false }
    ),
  }) as ReceiptClient;
}

export type WaitReceiptOptions = {
  /** Prefer wagmi's client when available; multi-RPC used as fallback */
  client?: ReceiptClient | null;
  timeoutMs?: number;
  pollMs?: number;
};

/**
 * Wait until a Base tx is mined. Throws only after full timeout.
 */
export async function waitForBaseReceipt(
  hash: Hash,
  opts: WaitReceiptOptions = {}
): Promise<TransactionReceipt> {
  const timeoutMs = opts.timeoutMs ?? 180_000;
  const pollMs = opts.pollMs ?? 2_000;
  const primary = opts.client ?? null;
  const fallbackClient = multiRpcClient();
  const started = Date.now();
  let lastErr: unknown = null;

  while (Date.now() - started < timeoutMs) {
    const clients = [primary, fallbackClient].filter(
      Boolean
    ) as ReceiptClient[];
    for (const client of clients) {
      try {
        const receipt = await client.getTransactionReceipt({ hash });
        if (receipt) {
          if (receipt.status === "reverted") {
            throw new Error(
              "Transaction reverted on Base. Check USDC balance and try again."
            );
          }
          return receipt;
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        // Not mined yet — keep polling
        if (
          /could not be found|not found|Pending|not been mined|null/i.test(msg)
        ) {
          lastErr = e;
          continue;
        }
        // Transient RPC errors — try next client / retry
        if (/timeout|rate limit|429|502|503|504|fetch/i.test(msg)) {
          lastErr = e;
          continue;
        }
        lastErr = e;
      }
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }

  const hint =
    lastErr instanceof Error ? lastErr.message : "RPC did not return a receipt";
  throw new Error(
    `Timed out waiting for Base confirmation (${hash.slice(0, 10)}…). ` +
      `The transaction may still succeed — check your wallet activity, then refresh tickets. (${hint})`
  );
}
