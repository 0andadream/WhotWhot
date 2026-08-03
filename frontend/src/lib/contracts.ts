import { type Address } from "viem";

/** Base mainnet addresses: Megapot protocol */
export const BASE_CHAIN_ID = 8453;

export const ADDRESSES = {
  usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address,
  jackpot: "0x3bAe643002069dBCbcd62B1A4eb4C4A397d042a2" as Address,
  jackpotTicketNft: "0x48FfE35AbB9f4780a4f1775C2Ce1c46185b366e4" as Address,
  jackpotRandomTicketBuyer: "0xb9560b43b91dE2c1DaF5dfbb76b2CFcDaFc13aBd" as Address,
  /**
   * WhotMatchEscrow on Base (Megapot JackpotTicketNFT stakes).
   * Override with NEXT_PUBLIC_WHOT_ESCROW_ADDRESS if you redeploy.
   */
  whotEscrow: (process.env.NEXT_PUBLIC_WHOT_ESCROW_ADDRESS ||
    "0xEC8cA16E0C751f45c3Bea800c9cB4be7710A81D8") as Address,
} as const;

export const erc721Abi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "ownerOf",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "setApprovalForAll",
    stateMutability: "nonpayable",
    inputs: [
      { name: "operator", type: "address" },
      { name: "approved", type: "bool" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "isApprovedForAll",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "operator", type: "address" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "tokenId", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

/** Megapot JackpotTicketNFT: list tickets by drawing */
export const jackpotTicketNftAbi = [
  ...erc721Abi,
  {
    type: "function",
    name: "getUserTickets",
    stateMutability: "view",
    inputs: [
      { name: "_userAddress", type: "address" },
      { name: "_drawingId", type: "uint256" },
    ],
    outputs: [
      {
        type: "tuple[]",
        components: [
          { name: "ticketId", type: "uint256" },
          {
            name: "ticket",
            type: "tuple",
            components: [
              { name: "drawingId", type: "uint256" },
              { name: "packedTicket", type: "uint256" },
              { name: "referralScheme", type: "bytes32" },
            ],
          },
          { name: "normals", type: "uint8[]" },
          { name: "bonusball", type: "uint8" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "getExtendedTicketInfo",
    stateMutability: "view",
    inputs: [{ name: "_ticketId", type: "uint256" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "ticketId", type: "uint256" },
          {
            name: "ticket",
            type: "tuple",
            components: [
              { name: "drawingId", type: "uint256" },
              { name: "packedTicket", type: "uint256" },
              { name: "referralScheme", type: "bytes32" },
            ],
          },
          { name: "normals", type: "uint8[]" },
          { name: "bonusball", type: "uint8" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "getTicketInfo",
    stateMutability: "view",
    inputs: [{ name: "_ticketId", type: "uint256" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "drawingId", type: "uint256" },
          { name: "packedTicket", type: "uint256" },
          { name: "referralScheme", type: "bytes32" },
        ],
      },
    ],
  },
] as const;

export const erc20Abi = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

/** Minimal Jackpot ABI for jackpot size + buy + drawing state */
export const jackpotAbi = [
  {
    type: "function",
    name: "currentDrawingId",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "getDrawingState",
    stateMutability: "view",
    inputs: [{ name: "_drawingId", type: "uint256" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "prizePool", type: "uint256" },
          { name: "ticketPrice", type: "uint256" },
          { name: "edgePerTicket", type: "uint256" },
          { name: "referralWinShare", type: "uint256" },
          { name: "referralFee", type: "uint256" },
          { name: "globalTicketsBought", type: "uint256" },
          { name: "lpEarnings", type: "uint256" },
          { name: "drawingTime", type: "uint256" },
          { name: "winningTicket", type: "uint256" },
          { name: "ballMax", type: "uint8" },
          { name: "bonusballMax", type: "uint8" },
          { name: "payoutCalculator", type: "address" },
          { name: "jackpotLock", type: "bool" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "ticketPrice",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "buyTickets",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "_tickets",
        type: "tuple[]",
        components: [
          { name: "normals", type: "uint8[]" },
          { name: "bonusball", type: "uint8" },
        ],
      },
      { name: "_recipient", type: "address" },
      { name: "_referrers", type: "address[]" },
      { name: "_referralSplit", type: "uint256[]" },
      { name: "_source", type: "bytes32" },
    ],
    outputs: [{ name: "ticketIds", type: "uint256[]" }],
  },
  {
    type: "function",
    name: "claimWinnings",
    stateMutability: "nonpayable",
    inputs: [{ name: "_userTicketIds", type: "uint256[]" }],
    outputs: [],
  },
  {
    type: "function",
    name: "getTicketTierIds",
    stateMutability: "view",
    inputs: [{ name: "_ticketIds", type: "uint256[]" }],
    outputs: [{ name: "tierIds", type: "uint256[]" }],
  },
  {
    type: "function",
    name: "getDrawingTierPayouts",
    stateMutability: "view",
    inputs: [{ name: "_drawingId", type: "uint256" }],
    outputs: [{ type: "uint256[12]" }],
  },
  {
    type: "function",
    name: "getUnpackedTicket",
    stateMutability: "view",
    inputs: [
      { name: "_drawingId", type: "uint256" },
      { name: "_packedTicket", type: "uint256" },
    ],
    outputs: [
      { name: "normals", type: "uint8[]" },
      { name: "bonusball", type: "uint8" },
    ],
  },
] as const;

export const randomBuyerAbi = [
  {
    type: "function",
    name: "buyTickets",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_count", type: "uint256" },
      { name: "_recipient", type: "address" },
      { name: "_referrers", type: "address[]" },
      { name: "_referralSplitBps", type: "uint256[]" },
      { name: "_source", type: "bytes32" },
    ],
    outputs: [],
  },
] as const;

export const whotEscrowAbi = [
  {
    type: "function",
    name: "createMatch",
    stateMutability: "nonpayable",
    inputs: [{ name: "ticketId", type: "uint256" }],
    outputs: [{ name: "matchId", type: "uint256" }],
  },
  {
    type: "function",
    name: "createChallenge",
    stateMutability: "nonpayable",
    inputs: [
      { name: "ticketId", type: "uint256" },
      { name: "challenged", type: "address" },
    ],
    outputs: [{ name: "matchId", type: "uint256" }],
  },
  {
    type: "function",
    name: "joinMatch",
    stateMutability: "nonpayable",
    inputs: [
      { name: "matchId", type: "uint256" },
      { name: "ticketId", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "submitResult",
    stateMutability: "nonpayable",
    inputs: [
      { name: "matchId", type: "uint256" },
      { name: "winner", type: "address" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "updateResult",
    stateMutability: "nonpayable",
    inputs: [
      { name: "matchId", type: "uint256" },
      { name: "winner", type: "address" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "cancelWaiting",
    stateMutability: "nonpayable",
    inputs: [{ name: "matchId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "cancelActive",
    stateMutability: "nonpayable",
    inputs: [{ name: "matchId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "postMove",
    stateMutability: "nonpayable",
    inputs: [
      { name: "matchId", type: "uint256" },
      { name: "payload", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "getMatch",
    stateMutability: "view",
    inputs: [{ name: "matchId", type: "uint256" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "player1", type: "address" },
          { name: "player2", type: "address" },
          { name: "ticket1", type: "uint256" },
          { name: "ticket2", type: "uint256" },
          { name: "status", type: "uint8" },
          { name: "player1Result", type: "address" },
          { name: "player2Result", type: "address" },
          { name: "createdAt", type: "uint64" },
          { name: "startedAt", type: "uint64" },
          { name: "gameSeed", type: "bytes32" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "getOpenMatches",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256[]" }],
  },
  {
    type: "function",
    name: "ticketNFT",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "nextMatchId",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "matches",
    stateMutability: "view",
    inputs: [{ name: "", type: "uint256" }],
    outputs: [
      { name: "player1", type: "address" },
      { name: "player2", type: "address" },
      { name: "ticket1", type: "uint256" },
      { name: "ticket2", type: "uint256" },
      { name: "status", type: "uint8" },
      { name: "player1Result", type: "address" },
      { name: "player2Result", type: "address" },
      { name: "createdAt", type: "uint64" },
      { name: "startedAt", type: "uint64" },
      { name: "gameSeed", type: "bytes32" },
    ],
  },
  {
    type: "event",
    name: "MatchCreated",
    inputs: [
      { name: "matchId", type: "uint256", indexed: true },
      { name: "player1", type: "address", indexed: true },
      { name: "ticketId", type: "uint256", indexed: false },
      { name: "createdAt", type: "uint64", indexed: false },
    ],
  },
  {
    type: "event",
    name: "MatchJoined",
    inputs: [
      { name: "matchId", type: "uint256", indexed: true },
      { name: "player2", type: "address", indexed: true },
      { name: "ticketId", type: "uint256", indexed: false },
      { name: "gameSeed", type: "bytes32", indexed: false },
      { name: "startedAt", type: "uint64", indexed: false },
    ],
  },
  {
    type: "event",
    name: "MatchResolved",
    inputs: [
      { name: "matchId", type: "uint256", indexed: true },
      { name: "winner", type: "address", indexed: true },
      { name: "ticket1", type: "uint256", indexed: false },
      { name: "ticket2", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "MovePosted",
    inputs: [
      { name: "matchId", type: "uint256", indexed: true },
      { name: "player", type: "address", indexed: true },
      { name: "moveIndex", type: "uint256", indexed: false },
      { name: "payload", type: "bytes", indexed: false },
    ],
  },
] as const;

export const MatchStatus = {
  None: 0,
  Waiting: 1,
  Active: 2,
  Resolved: 3,
  Cancelled: 4,
} as const;
