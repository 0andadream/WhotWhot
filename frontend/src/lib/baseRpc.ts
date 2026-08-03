/**
 * Resilient Base RPC for server routes.
 * Public mainnet.base.org rate-limits hard under 1.5s match polling.
 */
import { createPublicClient, fallback, http, type Chain, type PublicClient } from "viem";

const baseChain = {
  id: 8453,
  name: "Base",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: {
      http: [
        "https://base-rpc.publicnode.com",
        "https://mainnet.base.org",
        "https://base.llamarpc.com",
      ],
    },
  },
} as const satisfies Chain;

function rpcList(): string[] {
  const preferred = [
    process.env.BASE_RPC_URL,
    process.env.NEXT_PUBLIC_BASE_RPC,
    "https://base-rpc.publicnode.com",
    "https://base.llamarpc.com",
    "https://1rpc.io/base",
    "https://mainnet.base.org",
  ].filter(Boolean) as string[];
  // de-dupe
  return [...new Set(preferred)];
}

let cached: PublicClient | null = null;

export function getBasePublicClient(): PublicClient {
  if (cached) return cached;
  const urls = rpcList();
  cached = createPublicClient({
    chain: baseChain,
    transport: fallback(
      urls.map((url) =>
        http(url, {
          timeout: 8_000,
          retryCount: 1,
          retryDelay: 250,
        })
      ),
      { rank: false }
    ),
  });
  return cached;
}
