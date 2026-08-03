/**
 * Resilient Base RPC for server routes.
 * Public mainnet.base.org rate-limits hard under polling + ticket reads.
 */
import { createPublicClient, fallback, http, type Chain, type PublicClient } from "viem";
import { baseRpcUrls } from "@/lib/baseRpcUrls";

const baseChain = {
  id: 8453,
  name: "Base",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: {
      http: baseRpcUrls(),
    },
  },
} as const satisfies Chain;

let cached: PublicClient | null = null;

export function getBasePublicClient(): PublicClient {
  if (cached) return cached;
  const urls = baseRpcUrls();
  cached = createPublicClient({
    chain: baseChain,
    transport: fallback(
      urls.map((url) =>
        http(url, {
          timeout: 10_000,
          retryCount: 2,
          retryDelay: 300,
        })
      ),
      { rank: false }
    ),
  });
  return cached;
}
