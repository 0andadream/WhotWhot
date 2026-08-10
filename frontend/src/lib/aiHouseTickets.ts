/**
 * Ensure the Agent wallet has a stakeable open-draw Megapot ticket.
 * Buys one via JackpotRandomTicketBuyer if inventory is empty (needs USDC + ETH gas).
 */
import {
  encodeFunctionData,
  maxUint256,
  stringToHex,
  type Account,
  type Hash,
  type PublicClient,
  type WalletClient,
} from "viem";
import { base } from "viem/chains";
import {
  ADDRESSES,
  erc20Abi,
  erc721Abi,
  jackpotAbi,
  jackpotTicketNftAbi,
  randomBuyerAbi,
} from "@/lib/contracts";

function winningTicketOf(state: unknown): bigint {
  if (!state || typeof state !== "object") return 0n;
  const s = state as { winningTicket?: bigint };
  if (s.winningTicket !== undefined && s.winningTicket !== null) {
    return BigInt(s.winningTicket as bigint | number | string);
  }
  if (Array.isArray(state) && state[8] !== undefined) {
    return BigInt(state[8] as bigint | number | string);
  }
  return 0n;
}

async function sendAndWait(
  publicClient: PublicClient,
  wallet: WalletClient,
  account: Account,
  tx: { to: `0x${string}`; data: `0x${string}` }
): Promise<Hash> {
  const hash = await wallet.sendTransaction({
    account,
    chain: base,
    to: tx.to,
    data: tx.data,
  });
  const receipt = await publicClient.waitForTransactionReceipt({
    hash,
    confirmations: 1,
    timeout: 120_000,
  });
  if (receipt.status !== "success") {
    throw new Error(`Transaction reverted (${hash})`);
  }
  return hash;
}

async function readUsdcAllowance(
  publicClient: PublicClient,
  owner: `0x${string}`,
  spender: `0x${string}`
): Promise<bigint> {
  return (await publicClient.readContract({
    address: ADDRESSES.usdc,
    abi: erc20Abi,
    functionName: "allowance",
    args: [owner, spender],
  })) as bigint;
}

/**
 * Ensure USDC allowance for spender is at least `need`.
 * Uses max approval so the Agent does not re-approve every buy.
 */
async function ensureUsdcAllowance(opts: {
  publicClient: PublicClient;
  wallet: WalletClient;
  account: Account;
  spender: `0x${string}`;
  need: bigint;
}) {
  const owner = opts.account.address as `0x${string}`;
  let allowance = await readUsdcAllowance(
    opts.publicClient,
    owner,
    opts.spender
  );
  if (allowance >= opts.need) return;

  // Some USDC-style tokens need reset to 0 before raising allowance
  if (allowance > 0n && allowance < opts.need) {
    await sendAndWait(opts.publicClient, opts.wallet, opts.account, {
      to: ADDRESSES.usdc,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: "approve",
        args: [opts.spender, 0n],
      }),
    });
  }

  await sendAndWait(opts.publicClient, opts.wallet, opts.account, {
    to: ADDRESSES.usdc,
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: "approve",
      args: [opts.spender, maxUint256],
    }),
  });

  // Re-read (public RPC lag) until allowance is visible
  for (let i = 0; i < 12; i++) {
    allowance = await readUsdcAllowance(
      opts.publicClient,
      owner,
      opts.spender
    );
    if (allowance >= opts.need) return;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(
    `USDC approve for ${opts.spender} did not confirm in time (allowance ${allowance}). Retry.`
  );
}

export async function findHouseStakeableTicket(
  publicClient: PublicClient,
  house: `0x${string}`
): Promise<bigint | null> {
  const drawingId = (await publicClient.readContract({
    address: ADDRESSES.jackpot,
    abi: jackpotAbi,
    functionName: "currentDrawingId",
  })) as bigint;

  let open = true;
  try {
    const st = await publicClient.readContract({
      address: ADDRESSES.jackpot,
      abi: jackpotAbi,
      functionName: "getDrawingState",
      args: [drawingId],
    });
    open = winningTicketOf(st) === 0n;
  } catch {
    open = true;
  }
  if (!open) return null;

  const rows = (await publicClient.readContract({
    address: ADDRESSES.jackpotTicketNft,
    abi: jackpotTicketNftAbi,
    functionName: "getUserTickets",
    args: [house, drawingId],
  })) as readonly { ticketId: bigint }[];

  for (const row of rows || []) {
    const id = BigInt(row.ticketId);
    try {
      const owner = (await publicClient.readContract({
        address: ADDRESSES.jackpotTicketNft,
        abi: erc721Abi,
        functionName: "ownerOf",
        args: [id],
      })) as string;
      if (owner.toLowerCase() === house.toLowerCase()) return id;
    } catch {
      /* burned / gone */
    }
  }
  return null;
}

export async function buyHouseTicket(opts: {
  publicClient: PublicClient;
  wallet: WalletClient;
  account: Account;
}): Promise<`0x${string}`> {
  const { publicClient, wallet, account } = opts;
  const house = account.address as `0x${string}`;

  const drawingId = (await publicClient.readContract({
    address: ADDRESSES.jackpot,
    abi: jackpotAbi,
    functionName: "currentDrawingId",
  })) as bigint;
  const st = (await publicClient.readContract({
    address: ADDRESSES.jackpot,
    abi: jackpotAbi,
    functionName: "getDrawingState",
    args: [drawingId],
  })) as { ticketPrice: bigint };

  const price = BigInt(st.ticketPrice);
  // Random buyer may pull slightly more than face price on some paths — pad headroom
  const need = price * 2n;

  const bal = (await publicClient.readContract({
    address: ADDRESSES.usdc,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [house],
  })) as bigint;
  if (bal < price) {
    throw new Error(
      `Agent wallet needs more USDC (has ${bal}, needs ${price}). Fund ${house} with USDC on Base.`
    );
  }

  // Buyer contract pulls USDC from msg.sender — must be approved for random buyer.
  // Also approve Jackpot in case the buyer routes transferFrom through it.
  await ensureUsdcAllowance({
    publicClient,
    wallet,
    account,
    spender: ADDRESSES.jackpotRandomTicketBuyer,
    need,
  });
  await ensureUsdcAllowance({
    publicClient,
    wallet,
    account,
    spender: ADDRESSES.jackpot,
    need,
  });

  // Attribution only — do NOT set Agent as its own referrer (self-referral
  // can break fee accounting and revert the buy). Inventory buys use empty referrers.
  const source = stringToHex(
    process.env.NEXT_PUBLIC_SOURCE_TAG
      ? `${process.env.NEXT_PUBLIC_SOURCE_TAG}-ai`
      : "whotwhot-ai",
    { size: 32 }
  );

  // Final allowance check right before buy
  const buyerAllow = await readUsdcAllowance(
    publicClient,
    house,
    ADDRESSES.jackpotRandomTicketBuyer
  );
  if (buyerAllow < price) {
    throw new Error(
      `USDC allowance for ticket buyer still too low (${buyerAllow} < ${price}).`
    );
  }

  // Prefer writeContract when available (better abi encoding / gas estimate)
  let buyHash: Hash;
  try {
    buyHash = await wallet.writeContract({
      account,
      chain: base,
      address: ADDRESSES.jackpotRandomTicketBuyer,
      abi: randomBuyerAbi,
      functionName: "buyTickets",
      args: [1n, house, [], [], source],
    });
  } catch {
    buyHash = await sendAndWait(publicClient, wallet, account, {
      to: ADDRESSES.jackpotRandomTicketBuyer,
      data: encodeFunctionData({
        abi: randomBuyerAbi,
        functionName: "buyTickets",
        args: [1n, house, [], [], source],
      }),
    });
    return buyHash;
  }
  const receipt = await publicClient.waitForTransactionReceipt({
    hash: buyHash,
    confirmations: 1,
    timeout: 120_000,
  });
  if (receipt.status !== "success") {
    throw new Error(
      `Agent buyTickets reverted (${buyHash}). Check Agent USDC (~$1+) and ETH gas on Base.`
    );
  }
  return buyHash;
}

export async function ensureHouseTicket(opts: {
  publicClient: PublicClient;
  wallet: WalletClient;
  account: Account;
}): Promise<bigint> {
  const house = opts.account.address as `0x${string}`;
  let ticket = await findHouseStakeableTicket(opts.publicClient, house);
  if (ticket != null) return ticket;

  await buyHouseTicket(opts);
  // NFT index can lag briefly
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    ticket = await findHouseStakeableTicket(opts.publicClient, house);
    if (ticket != null) return ticket;
  }
  throw new Error(
    "Bought a ticket for Agent but could not find it yet. Retry in a few seconds."
  );
}

export async function ensureEscrowApproval(opts: {
  publicClient: PublicClient;
  wallet: WalletClient;
  account: Account;
}) {
  const house = opts.account.address as `0x${string}`;
  const approved = (await opts.publicClient.readContract({
    address: ADDRESSES.jackpotTicketNft,
    abi: erc721Abi,
    functionName: "isApprovedForAll",
    args: [house, ADDRESSES.whotEscrow],
  })) as boolean;
  if (approved) return;
  await sendAndWait(opts.publicClient, opts.wallet, opts.account, {
    to: ADDRESSES.jackpotTicketNft,
    data: encodeFunctionData({
      abi: erc721Abi,
      functionName: "setApprovalForAll",
      args: [ADDRESSES.whotEscrow, true],
    }),
  });
}
