/**
 * Server-only Agent wallet — stakes Megapot tickets vs players.
 * Requires AGENT_PRIVATE_KEY (or legacy AI_HOUSE_PRIVATE_KEY). Never expose to the client.
 */
import {
  createWalletClient,
  fallback,
  http,
  type Account,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { baseRpcUrls } from "@/lib/baseRpcUrls";
import { getBasePublicClient } from "@/lib/baseRpc";

/** Default Agent / treasury wallet (same as Megapot referrer) */
export const DEFAULT_AI_HOUSE_ADDRESS =
  "0xFD3f8634674C8e8d3A3dec78B90bC9417Ebef2f0" as const;

function agentPrivateKeyRaw(): string | undefined {
  return (
    process.env.AGENT_PRIVATE_KEY?.trim() ||
    process.env.AI_HOUSE_PRIVATE_KEY?.trim() ||
    undefined
  );
}

export function isAiHouseConfigured(): boolean {
  return Boolean(agentPrivateKeyRaw());
}

export function getAiHouseAccount(): Account | null {
  const raw = agentPrivateKeyRaw();
  if (!raw) return null;
  const key = (raw.startsWith("0x") ? raw : `0x${raw}`) as `0x${string}`;
  try {
    const account = privateKeyToAccount(key);
    const expected = getAiHouseAddress()?.toLowerCase();
    if (expected && account.address.toLowerCase() !== expected) {
      console.warn(
        "[agent] AGENT_PRIVATE_KEY / AI_HOUSE_PRIVATE_KEY does not match public Agent address",
        { keyAddress: account.address, expected }
      );
    }
    return account;
  } catch {
    return null;
  }
}

export function getAiHouseAddress(): `0x${string}` | null {
  const fromEnv =
    process.env.NEXT_PUBLIC_AGENT_ADDRESS?.trim() ||
    process.env.NEXT_PUBLIC_AI_HOUSE_ADDRESS?.trim();
  if (fromEnv?.startsWith("0x") && fromEnv.length === 42) {
    return fromEnv as `0x${string}`;
  }
  // If key is set, prefer derived address
  const raw = agentPrivateKeyRaw();
  if (raw) {
    try {
      const key = (raw.startsWith("0x") ? raw : `0x${raw}`) as `0x${string}`;
      return privateKeyToAccount(key).address;
    } catch {
      /* fall through */
    }
  }
  return DEFAULT_AI_HOUSE_ADDRESS;
}

export function getAiHouseWalletClient(): {
  account: Account;
  wallet: WalletClient;
  publicClient: ReturnType<typeof getBasePublicClient>;
} | null {
  const account = getAiHouseAccount();
  if (!account) return null;
  const publicClient = getBasePublicClient();
  const wallet = createWalletClient({
    account,
    chain: base,
    transport: fallback(
      baseRpcUrls().map((url) =>
        http(url, { timeout: 20_000, retryCount: 2, retryDelay: 400 })
      ),
      { rank: false }
    ),
  });
  return { account, wallet, publicClient };
}
