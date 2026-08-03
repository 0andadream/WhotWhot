import { http, createConfig, createStorage, cookieStorage } from "wagmi";
import { base } from "wagmi/chains";
// Import from @wagmi/core — NOT wagmi/connectors — so webpack never pulls
// baseAccount → @base-org/account → @coinbase/cdp-sdk → missing @x402/* modules.
import { injected } from "@wagmi/core";

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
