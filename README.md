# WhotWhot

**Multiplayer onchain Whot** (Nigerian card game) for the **Inco × Megapot Summer Game Jam** on **Base**.

Stake **1 Megapot ticket** each → play Whot → **winner receives both ticket NFTs**.

## Quick start

```bash
# Install (from repo root)
npm install

# Compile & test contracts
npm run contracts:compile
npm run contracts:test

# Frontend
cp .env.example .env
# optional: NEXT_PUBLIC_WHOT_ESCROW_ADDRESS=0x... after deploy
# optional: NEXT_PUBLIC_REFERRER_ADDRESS=0x... for Megapot referral fees
npm run dev
# → http://localhost:3000
```

### Deploy escrow (Base)

```bash
# .env: PRIVATE_KEY, BASE_RPC_URL, BASESCAN_API_KEY
cd contracts
npx hardhat run scripts/deploy.ts --network base
# Set NEXT_PUBLIC_WHOT_ESCROW_ADDRESS in frontend .env
```

On Base mainnet the escrow uses official Megapot **JackpotTicketNFT**:

`0x48FfE35AbB9f4780a4f1775C2Ce1c46185b366e4`

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md).

| Layer | Role |
| ----- | ---- |
| `WhotMatchEscrow.sol` | Create/join match, lock 2 ticket NFTs, dual-confirm winner → transfer both |
| `frontend/src/lib/whot` | Full Nigerian Whot rules (match shape/number + specials) |
| Lobby UI | Ticket **count only**, live Megapot jackpot + countdown |
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

## Demo paths

1. **Practice vs AI** — no wallet/tickets required  
2. **Stake match** — approve ticket NFT → create/join → play → both `submitResult` → winner gets both tickets  

## Jam notes

- Gameplay is **client-side** with shared `gameSeed` from the escrow; moves can be relayed via `postMove` events for 2-player sync without a backend.
- Payout is **trust-minimized** via dual confirmation (both players must agree on the winner).
- Inco confidential compute not integrated in v1 (escrow + public play is enough for a playable demo).
