# WhotWhot Architecture

Built for the **Inco × Megapot Summer Game Jam** on Base.

## Core loop

```
Buy/own Megapot ticket ($1 USDC)
        ↓
createMatch(ticketId) / joinMatch(matchId, ticketId)
        ↓
Both ticket NFTs locked in WhotMatchEscrow
        ↓
Play Whot (client engine; seed = on-chain gameSeed)
        ↓
Both players submitResult(matchId, winner)
        ↓
If both agree → safeTransfer both NFTs to winner
```

## Smart contracts

### `WhotMatchEscrow.sol`

| Function | Description |
| -------- | ----------- |
| `createMatch(ticketId)` | Pull ERC-721 ticket from creator; status `Waiting` |
| `createChallenge(ticketId, challenged)` | Same + `ChallengeCreated` event for UI |
| `joinMatch(matchId, ticketId)` | Second stake; sets `gameSeed`; status `Active` |
| `submitResult(matchId, winner)` | Dual confirmation; on agreement transfers both tickets |
| `updateResult` | Change submission before mutual agreement |
| `cancelWaiting` | Creator (or timeout) returns ticket |
| `cancelActive` | After 2h timeout, return both tickets |
| `postMove(matchId, payload)` | Optional opaque move log for multiplayer without a server |
| `getOpenMatches()` | Lobby list |

**Ticket NFT:** Megapot `JackpotTicketNFT` on Base  
`0x48FfE35AbB9f4780a4f1775C2Ce1c46185b366e4`

**Mock:** `MockTicketNFT.sol` for local Hardhat tests.

### Why dual-confirm (not full on-chain Whot)?

Encoding full turn validation + hands on-chain is gas-heavy for a jam. Dual confirmation:

- Prevents either player from unilaterally claiming the pot
- Disagreement → tickets stay locked until `RESULT_TIMEOUT` (2h) then either can cancel and reclaim
- Still uses **real Megapot NFTs** as stakes

## Frontend

- **Next.js 14** + **wagmi/viem** + React Query  
- Mobile-first cream/red Whot UI  
- Lobby shows **ticket count only** (no NFT gallery)  
- Live jackpot: `Jackpot.getDrawingState`  
- Buy path: approve USDC → `JackpotRandomTicketBuyer.buyTickets(1, …)`

### Game engine (`src/lib/whot`)

- Standard 54-card Nigerian composition  
- Specials + pick stacking  
- Deterministic shuffle from seed (match `gameSeed` or local random for AI)  
- Simple heuristic AI for practice mode  

### Multiplayer sync

1. Both clients init state from `gameSeed`  
2. On play, human posts action JSON via `postMove`  
3. Peers apply `MovePosted` events  
4. On win, both call `submitResult`  

Fallback: host can play practice AI offline for judges without a second wallet.

## Megapot integration

| Contract | Address (Base) |
| -------- | -------------- |
| USDC | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| Jackpot | `0x3bAe643002069dBCbcd62B1A4eb4C4A397d042a2` |
| JackpotTicketNFT | `0x48FfE35AbB9f4780a4f1775C2Ce1c46185b366e4` |
| JackpotRandomTicketBuyer | `0xb9560b43b91dE2c1DaF5dfbb76b2CFcDaFc13aBd` |

Set `NEXT_PUBLIC_REFERRER_ADDRESS` to earn Megapot referral fees on ticket buys from this app.

## Simplifications (jam)

1. **No full on-chain rules validation** — escrow + dual confirm  
2. **Ticket ID entry** — Megapot NFT may not be enumerable; UI asks for token id when staking (lobby still only shows count)  
3. **No Inco TEE / encrypted state** — can wrap later for hidden hands  
4. **No automatic forfeit on disconnect** — 2h cancel timeout  
5. **Move sync best-effort** — depends on RPC event history; local optimistic updates  

## Repo layout

```
contracts/
  src/WhotMatchEscrow.sol
  src/mocks/MockTicketNFT.sol
  test/WhotMatchEscrow.ts
  scripts/deploy.ts
frontend/
  src/app/…          # Lobby, AI, create/join/match
  src/lib/whot/      # Rules engine
  src/lib/contracts.ts
ARCHITECTURE.md
README.md
```
