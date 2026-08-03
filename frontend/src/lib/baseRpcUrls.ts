/**
 * Shared Base RPC list for browser (wagmi) and server routes.
 * Prefer publicnode / community RPCs; mainnet.base.org rate-limits hard.
 */

export function baseRpcUrls(): string[] {
  const preferred = [
    process.env.NEXT_PUBLIC_BASE_RPC,
    process.env.BASE_RPC_URL,
    "https://base-rpc.publicnode.com",
    "https://base.llamarpc.com",
    "https://1rpc.io/base",
    "https://base.meowrpc.com",
    "https://mainnet.base.org",
  ].filter(Boolean) as string[];
  return [...new Set(preferred)];
}
