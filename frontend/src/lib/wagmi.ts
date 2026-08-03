import { http, createConfig } from "wagmi";
import { base, hardhat } from "wagmi/chains";
import { injected, coinbaseWallet } from "wagmi/connectors";

const projectId = process.env.NEXT_PUBLIC_WC_PROJECT_ID || "demo";

export const config = createConfig({
  chains: [base, hardhat],
  connectors: [
    injected(),
    coinbaseWallet({ appName: "WhotWhot" }),
  ],
  transports: {
    [base.id]: http(process.env.NEXT_PUBLIC_BASE_RPC || "https://mainnet.base.org"),
    [hardhat.id]: http("http://127.0.0.1:8545"),
  },
  ssr: true,
});

export { projectId };
