# Upstash Redis (required for multiplayer)

WhotWhot stores **moves, chat, profiles, and timeout outcomes** in a shared backend.

- **With Redis** → both phones see the same data (`storage: redis`)
- **Without Redis** → each Vercel server instance has its own memory (`storage: memory`) → chat/profiles flash or never reach the opponent

## Fastest setup (Vercel + Upstash)

1. Open your Vercel project → **Integrations** → search **Upstash**  
   Or: https://vercel.com/integrations/upstash
2. **Add Integration** → select the **WhotWhot** project → create a **free** Redis database.
3. Confirm these env vars exist under **Settings → Environment Variables** (Production + Preview):

   | Name | Example |
   |------|---------|
   | `UPSTASH_REDIS_REST_URL` | `https://xxxx.upstash.io` |
   | `UPSTASH_REDIS_REST_TOKEN` | long secret token |

4. **Redeploy** Production (Deployments → … → Redeploy). Env vars only apply after redeploy.
5. Play a live match → chat header should say **live** (not **temp storage**).

## Manual setup

1. Create a free DB at https://console.upstash.com → Redis → Create Database.
2. Open **REST API** and copy URL + token.
3. Vercel → Project → Settings → Environment Variables → add both names above.
4. Redeploy.

## Local dev

Add to `frontend/.env.local` (never commit):

```bash
UPSTASH_REDIS_REST_URL=https://xxxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=xxxxxxxx
```

Restart `next dev`.

## Verify

After deploy, open a match with two wallets. Chat panel should show **live**. If it still says **temp storage**, env vars are missing or the redeploy didn’t pick them up.
