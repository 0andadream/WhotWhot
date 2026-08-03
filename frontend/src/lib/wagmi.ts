import { http, createConfig, createStorage, cookieStorage, fallback } from "wagmi";
import { base } from "wagmi/chains";
import { injected } from "@wagmi/core";
import { baseRpcUrls } from "@/lib/baseRpcUrls";

/**
 * Injected wallets work on desktop extensions and mobile in-app browsers
 * (MetaMask, Coinbase Wallet, Rainbow, etc.).
 *
 * Avoid wagmi/connectors barrel (Coinbase CDP / @x402 build breaks).
 * Multi-RPC fallback: public mainnet.base.org alone rate-limits ticket reads.
 */
const transports = fallback(
  baseRpcUrls().map((url) =>
    http(url, {
      timeout: 12_000,
      retryCount: 2,
      retryDelay: 400,
    })
  ),
  { rank: false }
);

export const config = createConfig({
  chains: [base],
  connectors: [
    injected({
      shimDisconnect: true,
    }),
  ],
  transports: {
    [base.id]: transports,
  },
  ssr: true,
  storage: createStorage({
    storage: cookieStorage,
  }),
  // Fewer background eth_calls when tab is idle
  pollingInterval: 12_000,
});
