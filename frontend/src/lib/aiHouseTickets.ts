/**
 * Ensure the Agent wallet has a stakeable open-draw Megapot ticket.
 * Buys via Jackpot.buyTickets (custom numbers) — not RandomTicketBuyer —
 * so gas is lower/more predictable and only Jackpot USDC allowance is needed.
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

/** Jackpot.buyTickets ~780k; pad hard so Agent never OOGs mid-buy. */
const BUY_GAS_FLOOR = 1_200_000n;
const GAS_BUFFER_BPS = 15_000n; // 1.5x

async function estimateGasWithBuffer(
  publicClient: PublicClient,
  account: Account,
  tx: { to: `0x${string}`; data: `0x${string}` },
  floor: bigint = 300_000n
): Promise<bigint> {
  try {
    const est = await publicClient.estimateGas({
      account: account.address,
      to: tx.to,
      data: tx.data,
    });
    const padded = (est * GAS_BUFFER_BPS) / 10_000n;
    return padded > floor ? padded : floor;
  } catch {
    return floor;
  }
}

async function sendAndWait(
  publicClient: PublicClient,
  wallet: WalletClient,
  account: Account,
  tx: { to: `0x${string}`; data: `0x${string}` },
  gasFloor: bigint = 300_000n
): Promise<Hash> {
  const gas = await estimateGasWithBuffer(publicClient, account, tx, gasFloor);
  const hash = await wallet.sendTransaction({
    account,
    chain: base,
    to: tx.to,
    data: tx.data,
    gas,
  });
  const receipt = await publicClient.waitForTransactionReceipt({
    hash,
    confirmations: 1,
    timeout: 120_000,
  });
  if (receipt.status !== "success") {
    const used = receipt.gasUsed ?? 0n;
    const pct = gas > 0n ? Number((used * 10000n) / gas) / 100 : 0;
    throw new Error(
      `Transaction reverted (${hash})${
        pct >= 95 ? ` — ran out of gas (${used}/${gas}). Retry.` : ""
      }`
    );
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

/** Crypto-safe pick of n unique balls in [1, max]. */
function pickUniqueBalls(count: number, max: number): number[] {
  if (count > max) throw new Error(`Cannot pick ${count} unique balls from 1..${max}`);
  const set = new Set<number>();
  const buf = new Uint32Array(1);
  while (set.size < count) {
    crypto.getRandomValues(buf);
    set.add(1 + (buf[0]! % max));
  }
  return [...set].sort((a, b) => a - b);
}

function pickRandomTicket(ballMax: number, bonusballMax: number): {
  normals: number[];
  bonusball: number;
} {
  const normals = pickUniqueBalls(5, ballMax);
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  const bonusball = 1 + (buf[0]! % bonusballMax);
  return { normals, bonusball };
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
  })) as {
    ticketPrice: bigint;
    ballMax: number;
    bonusballMax: number;
    jackpotLock: boolean;
    winningTicket: bigint;
  };

  if (st.jackpotLock || winningTicketOf(st) !== 0n) {
    throw new Error(
      "Megapot drawing is locked/closed — Agent cannot buy a stake ticket right now. Retry after the next draw opens."
    );
  }

  const price = BigInt(st.ticketPrice);
  const ballMax = Number(st.ballMax) || 30;
  const bonusballMax = Number(st.bonusballMax) || 10;

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

  // Jackpot pulls USDC from msg.sender — approve Jackpot only (not RandomTicketBuyer).
  await ensureUsdcAllowance({
    publicClient,
    wallet,
    account,
    spender: ADDRESSES.jackpot,
    need: price,
  });

  // Empty referrers: Agent wallet is also the site referrer; self-referral is skipped.
  const source = stringToHex(
    process.env.NEXT_PUBLIC_SOURCE_TAG
      ? `${process.env.NEXT_PUBLIC_SOURCE_TAG}-ai`
      : "whotwhot-ai",
    { size: 32 }
  );

  // Pick a unique line (retries if already sold this draw).
  let ticket: { normals: number[]; bonusball: number } | null = null;
  for (let i = 0; i < 12; i++) {
    const candidate = pickRandomTicket(ballMax, bonusballMax);
    try {
      const taken = (await publicClient.readContract({
        address: ADDRESSES.jackpot,
        abi: [
          {
            type: "function",
            name: "checkIfTicketsBought",
            stateMutability: "view",
            inputs: [
              { name: "_drawingId", type: "uint256" },
              {
                name: "_tickets",
                type: "tuple[]",
                components: [
                  { name: "normals", type: "uint8[]" },
                  { name: "bonusball", type: "uint8" },
                ],
              },
            ],
            outputs: [{ type: "bool[]" }],
          },
        ] as const,
        functionName: "checkIfTicketsBought",
        args: [drawingId, [candidate]],
      })) as readonly boolean[];
      if (taken?.[0]) continue;
    } catch {
      /* if check fails, still try buy — contract reverts on duplicate */
    }
    ticket = candidate;
    break;
  }
  if (!ticket) {
    throw new Error("Could not find an open Megapot number line for Agent. Retry.");
  }

  const jackpotAllow = await readUsdcAllowance(
    publicClient,
    house,
    ADDRESSES.jackpot
  );
  if (jackpotAllow < price) {
    throw new Error(
      `USDC allowance for Jackpot still too low (${jackpotAllow} < ${price}).`
    );
  }

  // Direct Jackpot.buyTickets — ~780k gas vs RandomTicketBuyer ~930k+ that OOGed at 890k.
  const buyData = encodeFunctionData({
    abi: jackpotAbi,
    functionName: "buyTickets",
    args: [
      [
        {
          normals: ticket.normals.map((n) => n),
          bonusball: ticket.bonusball,
        },
      ],
      house,
      [],
      [],
      source,
    ],
  });

  try {
    const buyHash = await sendAndWait(
      publicClient,
      wallet,
      account,
      { to: ADDRESSES.jackpot, data: buyData },
      BUY_GAS_FLOOR
    );
    return buyHash;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(
      `Agent Jackpot.buyTickets failed: ${msg}. Check Agent USDC (~$1+) and ETH gas on Base (${house}).`
    );
  }
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
  for (let i = 0; i < 12; i++) {
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
  await sendAndWait(
    opts.publicClient,
    opts.wallet,
    opts.account,
    {
      to: ADDRESSES.jackpotTicketNft,
      data: encodeFunctionData({
        abi: erc721Abi,
        functionName: "setApprovalForAll",
        args: [ADDRESSES.whotEscrow, true],
      }),
    },
    200_000n
  );
}
