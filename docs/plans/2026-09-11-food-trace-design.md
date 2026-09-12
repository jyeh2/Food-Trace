# FoodTrace — Design (hackathon prototype)

## Goal
Verify food provenance: each batch is a Solana NFT; each supply-chain stage
(farm → processing → distribution → retail) is recorded on-chain with a photo
hash. Consumers scan the product QR and see a verified timeline.

## Decisions (YAGNI, hackathon-scoped)
- **Chain:** Solana devnet (env-switchable to testnet via `SOLANA_RPC_URL`).
  Devnet chosen: Metaplex Core deployed there, faucet reliable.
- **NFT:** Metaplex Core asset, one per batch. Stage records written as
  on-chain **Attributes plugin** entries (`stage:<n>` → `sha256|ts|actor`).
  No custom Anchor program → zero deploy risk.
- **Signer:** single server keypair (`.keys/server.json`). No wallet adapter.
  Roles are simulated by stage stations.
- **Rotating stage QR (TOTP-style):** station page shows QR encoding
  `stage + HMAC(secret, stage, floor(now/30s))`. Server accepts ±1 window.
  Proves scan happened at that station at that time (anti-replay).
- **Product QR:** static, encodes batch id → `/verify/<id>`.
- **Storage:** SQLite (`better-sqlite3`) for batches/stages/photos; photos on
  disk under `data/uploads`. On-chain holds only hashes → verify page
  recomputes hash of stored photo and compares to chain.

## Flow
1. Producer creates batch on `/` → server mints Core NFT → batch QR shown.
2. Worker at stage opens `/scan` on phone: scans station QR (rotating) then
   product QR, takes photo, adds note, submits.
3. Server: verify TOTP code, sha256(photo), update NFT attributes on-chain,
   store row + tx sig.
4. Consumer scans product QR → `/verify/<id>`: timeline, photos, hash match
   ✓/✗ against on-chain attributes, explorer links.

## Pages / API
- `/` dashboard: create batch, list batches
- `/station/[stage]` rotating QR display (laptop at station)
- `/scan` camera scanner + photo + submit
- `/verify/[id]` consumer verification
- `POST /api/batches`, `GET /api/batches`
- `POST /api/stages` (multipart: batchId, stage, code, photo, note)
- `GET /api/station/[stage]` current code (for display)
- `GET /api/uploads/[file]` serve photo

## Error handling
- Bad/expired TOTP → 401 with reason.
- Stage out of order (must be prev+1) → 409.
- Chain tx failure → 502, nothing persisted.

## Testing
- Unit: TOTP generate/verify windows, stage-order check, hash compare.
- Manual: full flow on devnet; verify page shows ✓ then flip a photo byte → ✗.
