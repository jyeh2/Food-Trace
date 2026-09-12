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

`pnpm dev` runs with `--experimental-https` (self-signed via mkcert) so the
phone camera works over LAN: open `https://<laptop-LAN-IP>:3000/scan` on the
phone and accept the certificate warning once. `pnpm dev:http` for plain HTTP.
Set `NEXT_PUBLIC_BASE_URL` to the LAN URL so NFT metadata URIs resolve.

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
