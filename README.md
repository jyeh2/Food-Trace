# FoodTrace

Farm-to-shelf food provenance on Solana. Each batch is a Metaplex Core NFT;
each supply-chain stage writes a photo hash into the NFT's on-chain attributes.
Stage stations show a rotating (TOTP-style) QR so a scan proves presence at
that station at that moment.

## Run

```bash
pnpm install
# fund the server wallet (devnet). Address:
solana-keygen pubkey .keys/server.json
# → https://faucet.solana.com (needs GitHub login) or `solana airdrop 2 <addr> -u devnet`
pnpm dev
```

`.env.local`:

```
SOLANA_RPC_URL=https://api.devnet.solana.com   # or testnet
SOLANA_CLUSTER=devnet
SERVER_KEYPAIR_PATH=.keys/server.json
STATION_SECRET=change-me
STATION_DISPLAY_KEY=change-me-too   # station display pages open as /station/N?k=<this>
NEXT_PUBLIC_BASE_URL=http://localhost:3000     # use LAN IP for phone testing
```

## Demo flow

1. `/` — create batch → mints NFT → shows product QR.
2. `/station/1?k=<STATION_DISPLAY_KEY>` … `/station/4?k=…` — open on a laptop at
   each stage; QR rotates every 30s. Key is remembered in sessionStorage. Without
   it the code endpoint returns 401, so nobody can fetch codes remotely.
3. `/scan` on a phone — scan station QR, scan product QR (or type ID), take
   photo, submit. Server checks TOTP, hashes photo, updates NFT attributes.
4. `/verify/<id>` — consumer view. Recomputes photo hashes vs on-chain values.
   Edit a stored photo in `data/uploads/` → badge flips to TAMPERED.

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
- `src/lib/db.ts` — SQLite (better-sqlite3) batches/stages; photos in `data/uploads`
- `src/app/api/*` — batches, stages, station code, uploads, NFT metadata
- `src/app/{page,scan,station,verify}` — UI

## Tests

```bash
pnpm test
```
