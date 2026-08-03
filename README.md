# WhotWhot

**Multiplayer onchain Whot** (Nigerian card game) for the **Inco × Megapot Summer Game Jam** on **Base**.

Stake **1 Megapot ticket** each → play Whot → **winner receives both ticket NFTs**.

**Live escrow (Base):** [`0xEC8cA16E0C751f45c3Bea800c9cB4be7710A81D8`](https://basescan.org/address/0xEC8cA16E0C751f45c3Bea800c9cB4be7710A81D8)

## Quick start

```bash
# Install (from repo root)
npm install

# Compile & test contracts
npm run contracts:compile
npm run contracts:test

# Frontend
cp .env.example .env
# Set NEXT_PUBLIC_WHOT_ESCROW_ADDRESS after deploy (see DEPLOYED.md)
# optional: NEXT_PUBLIC_REFERRER_ADDRESS=0x... for Megapot referral fees
npm run dev
# → http://localhost:3000

# Production build (same as Vercel)
npm run build
```

### Deploy on Vercel

**Recommended settings** (monorepo):

| Setting | Value |
| -------- | ----- |
| Root Directory | `frontend` |
| Framework | Next.js |
| Build Command | `npm run build` (default) |
| Install Command | `npm install` (default) |

Or deploy from **repo root** (uses root `vercel.json`): install at root, `npm run build -w frontend`.

Env: `NEXT_PUBLIC_WHOT_ESCROW_ADDRESS=0xEC8cA16E0C751f45c3Bea800c9cB4be7710A81D8`

### Deploy escrow (Base)

```bash
# .env: PRIVATE_KEY, BASE_RPC_URL, BASESCAN_API_KEY
cd contracts
npx hardhat run scripts/deploy.ts --network base
# Set NEXT_PUBLIC_WHOT_ESCROW_ADDRESS in frontend .env / Vercel
```

On Base mainnet the escrow uses official Megapot **JackpotTicketNFT**:

`0x48FfE35AbB9f4780a4f1775C2Ce1c46185b366e4`

---

## Where do the tickets go?

There are **two different “wins.”** Don’t mix them up.

### A) Whot stake (both ticket NFTs in the match)

When you create/join a match, each player’s Megapot **ticket NFT is transferred into `WhotMatchEscrow`**.

| Situation | Where the two tickets go |
| --------- | ------------------------ |
| Both players **confirm the same Whot winner** on-chain (`submitResult`) | **Both NFTs → that winner’s wallet** |
| You never play / never confirm a winner | Tickets **stay locked in escrow** |
| **Active match** abandoned → after **2 hours**, either player calls `cancelActive` | **Each player gets their own ticket back** (no “winner takes both”) |
| **Waiting** (no opponent yet) → host calls `cancelWaiting` | **Host’s ticket returns** to the host |

**Important:** Playing cards does **not** cost gas. Wallet fees only apply to stake (create/join), cancel, and **confirm winner**.

### B) Megapot lottery win (daily drawing)

A staked ticket is still a real Megapot ticket for its drawing. The **lottery payout is tied to the NFT**, not to “who started the Whot match.”

| Who owns the ticket NFT | Who can claim Megapot winnings |
| ----------------------- | ------------------------------ |
| **Escrow** (match not finished) | **Neither player** can claim until the NFT leaves escrow — claim is by owner |
| After Whot resolves → winner owns both tickets | **Whot winner** can claim lottery prizes on those tickets (if any) |
| After timeout cancel → original tickets returned | **Each original owner** can claim on their own ticket |

If Megapot **draws while tickets are still in escrow**:

- The draw still runs as normal for those ticket numbers.
- Prize USDC is **claimable by whoever owns the NFT** when they call `claimWinnings`.
- While locked, ownership is the **escrow contract**, so players should **finish or cancel the match** before they can claim.

The drawing does **not** auto-send jackpot money to the original buyer if the ticket is sitting in escrow.

### Practical tips

- Not playing and no opponent yet → **cancel waiting** and get your ticket back.
- Both staked but abandoned → wait for the **2h cancel** (or both confirm a winner if you finished the game).
- Want lottery claim after a win → win/cancel first so the NFT is in **your** wallet, then claim on Megapot/Jackpot.

---

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) and [DEPLOYED.md](./DEPLOYED.md).

| Layer | Role |
| ----- | ---- |
| `WhotMatchEscrow.sol` | Create/join match, lock 2 ticket NFTs, dual-confirm winner → transfer both |
| `frontend/src/lib/whot` | Full Nigerian Whot rules (match shape/number + specials) |
| Lobby UI | Ticket **count** + tap-to-select tickets; live Megapot jackpot + countdown |
| Megapot | Buy random $1 tickets via `JackpotRandomTicketBuyer` |

## Whot rules (v1)

- Match **shape** (Circle, Triangle, Cross, Square, Star) or **number**
- **1** Hold On (play again)
- **2** Pick Two (stackable)
- **5** Pick Three (stackable)
- **8** Suspension / skip
- **14** General Market (opponent draws 1)
- **20** Whot wild — call any shape
- First to empty hand wins

Full player-facing guide: `/guide` in the app.

## Demo paths

1. **Practice vs AI** — no wallet/tickets required  
2. **Stake match** — name + pick ticket → create/join → play free → both `submitResult` → winner gets both tickets  

## Jam notes

- Gameplay is **client-side** (local move sync); only stake / cancel / confirm winner are on-chain.
- Payout is **trust-minimized** via dual confirmation (both players must agree on the winner).
- Inco confidential compute not integrated in v1 (escrow + public play is enough for a playable demo).
