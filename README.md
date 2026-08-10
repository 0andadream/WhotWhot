# WhotWhot

**Classic Nigerian Whot, onchain on Base** — stake **Megapot ticket NFTs**, play live, **winner takes both**.

**Live:** [whotwhot.xyz](https://whotwhot.xyz)

**Escrow (Base):** [`0xEC8cA16E0C751f45c3Bea800c9cB4be7710A81D8`](https://basescan.org/address/0xEC8cA16E0C751f45c3Bea800c9cB4be7710A81D8)

---

## How you play

| Mode | Stake | What happens |
| ---- | ----- | ------------ |
| **Practice vs Agent** | Free | Learn rules offline. No wallet required. |
| **Challenge Agent** | 1 ticket each | You stake; the **Agent** wallet stakes (buys a ticket if needed). Both lock in escrow. Winner takes both NFTs. |
| **Play with Friends** | 1 ticket each | Create/join a table. Dual-confirm on-chain. Winner takes both. |

Lobby also shows **live Megapot jackpot** size, draw countdown, and your **Megapot ticket count** (number only — no NFT gallery).

---

## Core loop (stake matches)

```
Own / buy Megapot ticket ($1 USDC on Base)
        ↓
createMatch(ticketId)  or  joinMatch(matchId, ticketId)
        ↓
Both ticket NFTs locked in WhotMatchEscrow
        ↓
Play Whot off-chain (shared gameSeed + move relay)
        ↓
Both sides submitResult(matchId, winner)
        ↓
Agreement → both NFTs transfer to the winner
```

**Agent challenge** uses the same escrow: you create the match; the server signs as the Agent to `joinMatch` and later `submitResult`.

---

## Where do the tickets go?

### A) Whot stake (NFTs in escrow)

| Situation | Result |
| --------- | ------ |
| Both confirm the **same** winner | **Both NFTs → winner** |
| Match abandoned while **Active** | After **2 hours**, either side can `cancelActive` → **each ticket returns to original staker** |
| **Waiting** (no opponent) | Host can `cancelWaiting` → host’s ticket returns |

Card plays do **not** cost gas. Wallet txs: stake (create/join), cancel, confirm winner.

### B) Megapot lottery (daily draw)

A staked ticket is still a real Megapot entry. Lottery claim follows **NFT ownership**:

- While locked in escrow → claim only after the match resolves or cancels.
- After Whot resolve → **Whot winner** owns both tickets and can claim any prizes on them.

If Megapot draws while tickets are in escrow, the draw still runs; prizes stay with the NFT. Finish or cancel so ownership is back in a player wallet before claiming.

---

## Revenue

### Megapot referral fees (ticket buys on WhotWhot)

Buys through the app pass `_referrers` + `_source` (`whotwhot`) so the site can earn Megapot purchase fees (~10% of ticket price, live on-chain) and win-share when referred players claim lottery prizes.

- Default referrer / treasury: `0xFD3f8634674C8e8d3A3dec78B90bC9417Ebef2f0`
- Override: `NEXT_PUBLIC_REFERRER_ADDRESS`
- Fees **accrue** on the Megapot Jackpot contract — **not auto-sent**. Claim with `claimReferralFees()` from that wallet (or Megapot UI).

### Challenge Agent

- Player **loses** → Agent keeps **both** tickets.
- Player **wins** → player receives **both**.
- Agent buys tickets with its USDC when inventory is empty (referral applies when the Agent buys).

---

## Quick start

```bash
# From repo root
npm install

# Contracts
npm run contracts:compile
npm run contracts:test

# Frontend env
cp .env.example .env
# See env section below

npm run dev
# → http://localhost:3000

npm run build   # production build (workspace)
```

### Deploy escrow (Base)

```bash
# .env: PRIVATE_KEY, BASE_RPC_URL, BASESCAN_API_KEY
cd contracts
npx hardhat run scripts/deploy.ts --network base
# Set NEXT_PUBLIC_WHOT_ESCROW_ADDRESS
```

**Megapot JackpotTicketNFT (Base):**  
`0x48FfE35AbB9f4780a4f1775C2Ce1c46185b366e4`

---

## Vercel

| Setting | Value |
| ------- | ----- |
| Root Directory | `frontend` |
| Framework | Next.js |
| Build / Install | defaults (`npm run build` / `npm install`) |

Or deploy from **repo root** if using root `vercel.json`.

### Required env (production)

```bash
NEXT_PUBLIC_WHOT_ESCROW_ADDRESS=0xEC8cA16E0C751f45c3Bea800c9cB4be7710A81D8
NEXT_PUBLIC_CHAIN_ID=8453

# Multiplayer relay + chat (Upstash Redis or Vercel KV)
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
# or: KV_REST_API_URL + KV_REST_API_TOKEN

# Megapot referral on ticket buys
NEXT_PUBLIC_REFERRER_ADDRESS=0xFD3f8634674C8e8d3A3dec78B90bC9417Ebef2f0
NEXT_PUBLIC_SOURCE_TAG=whotwhot

# Challenge Agent (server-only — never NEXT_PUBLIC_)
NEXT_PUBLIC_AGENT_ADDRESS=0xFD3f8634674C8e8d3A3dec78B90bC9417Ebef2f0
AGENT_PRIVATE_KEY=0x...   # private key for that same wallet
# Fund Agent with ETH (gas) + USDC (buy tickets). Env alone is not enough without funding.
# Redeploy after adding secrets. Status: GET /api/ai-match/status → ready: true
```

Legacy alias: `AI_HOUSE_PRIVATE_KEY` is accepted if `AGENT_PRIVATE_KEY` is unset.

Optional: `NEXT_PUBLIC_BASE_RPC` (private RPC reduces public rate limits).

After changing env vars on Vercel, **redeploy** so the runtime picks them up.

---

## Multiplayer move relay

| Action | Wallet? | Where |
|--------|---------|--------|
| Create / join (stake) | Yes | On-chain escrow |
| Each card / draw | **No** | `/api/match/:id/moves` (+ Redis) |
| Ready-up, chat, profiles | No | Match APIs + Redis |
| Confirm winner | Yes (once each) | On-chain `submitResult` |

Locally, an in-memory store works. On **Vercel**, Redis is required so both wallets share one log.

---

## Architecture

| Layer | Role |
| ----- | ---- |
| `contracts/src/WhotMatchEscrow.sol` | Create/join, lock 2 tickets, dual-confirm → transfer both |
| `frontend/src/lib/whot` | Full Whot rules engine + practice AI |
| `frontend/src/app/api/ai-match/*` | Agent join + dual-confirm (server wallet) |
| Lobby | Modes, jackpot strip, ticket count, buy flow |
| Megapot | Random $1 tickets via `JackpotRandomTicketBuyer` |

See [ARCHITECTURE.md](./ARCHITECTURE.md) and [DEPLOYED.md](./DEPLOYED.md).

### Agent health

```
GET /api/ai-match/status
→ { ready, hasPrivateKey, agentAddress, env: { AGENT_PRIVATE_KEY, ... } }
```

---

## Whot rules (v1)

- Match **shape** (Circle, Triangle, Cross, Square, Star) or **number**
- **1** Hold On · **2** Pick Two · **5** Pick Three · **8** Suspension · **14** General Market · **20** Whot (wild)
- First empty hand wins

In-app guide: `/guide`.

---

## Stack

- **Next.js 14** + React + TypeScript  
- **wagmi / viem** (Base)  
- **Framer Motion** + cream/red Whot UI  
- **Upstash Redis / Vercel KV** for multiplayer state  
- **Hardhat** for escrow  

---

## Notes

- Gameplay is **off-chain** (relay); only stake / cancel / confirm are on-chain.
- Dual confirmation prevents one side from unilaterally claiming the pot.
- Agent auto-confirms the reported outcome for Challenge Agent (same dual-confirm path as friends).
- Do **not** commit private keys. Keep `AGENT_PRIVATE_KEY` / `PRIVATE_KEY` in Vercel / local `.env` only.
