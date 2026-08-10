/**
 * Ensure the AI house wallet has a stakeable open-draw Megapot ticket.
 * Buys one via JackpotRandomTicketBuyer if inventory is empty (needs USDC + ETH gas).
 */
import {
  encodeFunctionData,
  parseUnits,
  stringToHex,
  type Account,
  type PublicClient,
  type WalletClient,
} from "viem";
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
  const house = account.address;

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
  const bal = (await publicClient.readContract({
    address: ADDRESSES.usdc,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [house],
  })) as bigint;
  if (bal < price) {
    throw new Error(
      `AI house needs more USDC (has ${bal}, needs ${price}). Fund ${house} with USDC on Base.`
    );
  }

  const allowance = (await publicClient.readContract({
    address: ADDRESSES.usdc,
    abi: erc20Abi,
    functionName: "allowance",
    args: [house, ADDRESSES.jackpotRandomTicketBuyer],
  })) as bigint;

  if (allowance < price) {
    const approveHash = await wallet.sendTransaction({
      account,
      chain: publicClient.chain,
      to: ADDRESSES.usdc,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: "approve",
        args: [ADDRESSES.jackpotRandomTicketBuyer, price * 20n],
      }),
    });
    await publicClient.waitForTransactionReceipt({ hash: approveHash });
  }

  const referrer = ADDRESSES.megapotReferrer;
  const source = stringToHex(
    process.env.NEXT_PUBLIC_SOURCE_TAG || "whotwhot-ai",
    { size: 32 }
  );
  const hasRef =
    referrer &&
    referrer !== "0x0000000000000000000000000000000000000000";

  const buyHash = await wallet.sendTransaction({
    account,
    chain: publicClient.chain,
    to: ADDRESSES.jackpotRandomTicketBuyer,
    data: encodeFunctionData({
      abi: randomBuyerAbi,
      functionName: "buyTickets",
      args: [
        1n,
        house,
        hasRef ? [referrer] : [],
        hasRef ? [parseUnits("1", 18)] : [],
        source,
      ],
    }),
  });
  await publicClient.waitForTransactionReceipt({ hash: buyHash });
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
  for (let i = 0; i < 8; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    ticket = await findHouseStakeableTicket(opts.publicClient, house);
    if (ticket != null) return ticket;
  }
  throw new Error(
    "Bought a ticket for AI house but could not find it yet. Retry in a few seconds."
  );
}

export async function ensureEscrowApproval(opts: {
  publicClient: PublicClient;
  wallet: WalletClient;
  account: Account;
}) {
  const house = opts.account.address;
  const approved = (await opts.publicClient.readContract({
    address: ADDRESSES.jackpotTicketNft,
    abi: erc721Abi,
    functionName: "isApprovedForAll",
    args: [house, ADDRESSES.whotEscrow],
  })) as boolean;
  if (approved) return;
  const hash = await opts.wallet.sendTransaction({
    account: opts.account,
    chain: opts.publicClient.chain,
    to: ADDRESSES.jackpotTicketNft,
    data: encodeFunctionData({
      abi: erc721Abi,
      functionName: "setApprovalForAll",
      args: [ADDRESSES.whotEscrow, true],
    }),
  });
  await opts.publicClient.waitForTransactionReceipt({ hash });
}
