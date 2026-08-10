/**
 * Server-only AI house wallet — stakes Megapot tickets vs players.
 * Requires AI_HOUSE_PRIVATE_KEY (never expose to the client).
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

export function isAiHouseConfigured(): boolean {
  return Boolean(process.env.AI_HOUSE_PRIVATE_KEY?.trim());
}

export function getAiHouseAccount(): Account | null {
  const raw = process.env.AI_HOUSE_PRIVATE_KEY?.trim();
  if (!raw) return null;
  const key = (raw.startsWith("0x") ? raw : `0x${raw}`) as `0x${string}`;
  try {
    return privateKeyToAccount(key);
  } catch {
    return null;
  }
}

export function getAiHouseAddress(): `0x${string}` | null {
  const fromEnv = process.env.NEXT_PUBLIC_AI_HOUSE_ADDRESS?.trim();
  if (fromEnv?.startsWith("0x") && fromEnv.length === 42) {
    return fromEnv as `0x${string}`;
  }
  return getAiHouseAccount()?.address ?? null;
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
