import { http, createConfig, createStorage, cookieStorage } from "wagmi";
import { base } from "wagmi/chains";
import { injected } from "@wagmi/core";

/**
 * Injected wallets work on desktop extensions and mobile in-app browsers
 * (MetaMask, Coinbase Wallet, Rainbow, etc.).
 * Mobile Safari without a wallet: Connect deep-links to MetaMask.
 *
 * Avoid wagmi/connectors barrel (Coinbase CDP / @x402 build breaks).
 */
export const config = createConfig({
  chains: [base],
  connectors: [
    injected({
      shimDisconnect: true,
    }),
  ],
  transports: {
    [base.id]: http(
      process.env.NEXT_PUBLIC_BASE_RPC || "https://mainnet.base.org"
    ),
  },
  ssr: true,
  storage: createStorage({
    storage: cookieStorage,
  }),
});
