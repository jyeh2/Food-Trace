# FoodTrace

Farm-to-shelf food provenance on Solana. Each batch is a Metaplex Core NFT;
each supply-chain stage writes a photo hash into the NFT's on-chain attributes.
Stage stations show a rotating (TOTP-style) QR so a scan proves presence at
that station at that moment.

## Run

```bash
pnpm install
# copy env.example → .env.local and fill secrets (Solana + Cloudflare D1)
# fund the server wallet (devnet). Address:
solana-keygen pubkey .keys/server.json
# → https://faucet.solana.com (needs GitHub login) or `solana airdrop 2 <addr> -u devnet`
pnpm db:migrate   # apply schema to the remote D1 database (wrangler login)
pnpm dev
```

`.env.local`:

```
SOLANA_RPC_URL=https://api.devnet.solana.com   # or testnet
SOLANA_CLUSTER=devnet
SERVER_KEYPAIR_PATH=.keys/server.json
STATION_SECRET=change-me
NEXT_PUBLIC_BASE_URL=http://localhost:3000     # use LAN IP for phone testing
# Production deploy uses https://foodtrace.oliverchou.dev

# Cloudflare D1 (HTTP API — required at runtime)
CLOUDFLARE_ACCOUNT_ID=                         # dashboard → Workers → account id
CLOUDFLARE_API_TOKEN=                          # token with Account / D1 / Edit
CLOUDFLARE_D1_DATABASE_ID=5c1ae019-3071-4e88-9f91-b3da7ce6b2b8

# OpenRouter (AI batch product reports)
OPENROUTER_API_KEY=                            # required for /reports/[batch_id]
OPENROUTER_MODEL=openai/gpt-4o-mini            # optional override
```

The `/reports/[batch_id]` page uses `OPENROUTER_API_KEY` and optional
`OPENROUTER_MODEL` to generate consumer-facing batch product reports via OpenRouter.

## Deploy (Cloudflare Workers)

Production host: **https://foodtrace.oliverchou.dev** (Custom Domain on Worker `cmuhacks-food-trace`).

`oliverchou.dev` must be in the same Cloudflare account you deploy with. First deploy creates the DNS record + certificate.

```bash
# one-time: upload secrets from .env.local (reads SERVER_KEYPAIR_PATH → SERVER_KEYPAIR_JSON)
pnpm secrets:put
# pnpm secrets:put --dry-run

# NEXT_PUBLIC_* is inlined at build time (not a Worker secret):
NEXT_PUBLIC_BASE_URL=https://foodtrace.oliverchou.dev pnpm deploy
```

`pnpm db:migrate` is unchanged (D1 already configured). Use Workers Paid if the gzipped Worker exceeds the free 3 MiB limit.

## Demo flow

1. `/` — create batch → mints NFT → shows product QR.
2. `/station/1` … `/station/4` — open on a laptop at each stage; pick the stage
   from the buttons at the top. QR rotates every 30s. No login required to view
   a station's code — anyone with the URL can display or fetch it.
3. `/scan` on a phone — scan station QR, scan product QR (or type ID), take
   photo, submit. Server checks TOTP, hashes photo, updates NFT attributes.
4. `/verify/<id>` — consumer view. Recomputes photo hashes vs on-chain values.
   Replace an object in the R2 bucket → badge flips to TAMPERED.

## iPhone camera setup

The camera needs trusted HTTPS and Safari camera permission. For development,
an HTTPS tunnel avoids installing a local certificate on the phone:

1. Install ngrok and complete its account/auth-token setup if required.
2. Stop any existing Next.js server and manually started ngrok process.
3. Run `pnpm dev`. This starts ngrok and Next.js together and prints the public
   HTTPS URL. It automatically sets `NEXT_PUBLIC_BASE_URL` for this run.
4. On the iPhone, open the printed **iPhone camera** URL in Safari,
   tap **Scan QR**, and allow camera access. Use the same public origin on the
   laptop when displaying product QR codes so they do not contain `localhost`.

Press Ctrl+C to stop both processes. The launcher refuses an occupied port;
use `PORT=3001 pnpm dev` if needed. Use `pnpm dev:http` for local HTTP only or
`pnpm dev:https` for local self-signed HTTPS only. Never use `localhost` on the
phone to reach the laptop.

Development origins allow ngrok subdomains (`*.ngrok-free.app`, `*.ngrok.app`,
`*.ngrok.io`) so changing tunnel URLs works without source edits. The launcher
also allows its assigned hostname. `DEV_ALLOWED_ORIGINS` adds comma-separated
hostnames for other development hosts. This allowlist is only for development,
not API authentication.
The tunnel exposes the demo, including its Mint endpoint; use devnet test funds
and stop the launcher with Ctrl+C when finished.

For direct Wi-Fi access, both devices must be on a network that permits peer
connections. Add the laptop's IP to `DEV_ALLOWED_ORIGINS`, use a certificate
covering that IP, and install/trust its certificate authority on the iPhone.
The default localhost certificate and dismissing a warning are not a reliable
camera setup. Campus Wi-Fi may block peer connections.

If Scan QR does nothing, check Safari's remote Web Inspector for script-loading
or initialization errors. If it reports camera permission denied, allow Camera
in Safari's settings for the site and retry. A production HTTPS deployment does
not use `DEV_ALLOWED_ORIGINS`, but still requires camera permission.

## Layout

- `src/lib/totp.ts` — rotating station code (HMAC-SHA256, 30s step, ±1 window)
- `src/lib/solana.ts` — Umi + mpl-core: mint, append stage attribute, read
- `src/lib/db.ts` — Cloudflare D1 batches/stages/orgs; `photo_file` is the R2 object key
- `src/lib/r2.ts` — Cloudflare R2 (S3 API) put/get for stage photos
- `src/app/api/*` — batches, stages, station code, uploads, NFT metadata
- `src/app/{page,scan,station,verify}` — UI

## Tests

```bash
pnpm test
```
