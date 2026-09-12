import { readFileSync } from "node:fs";
import path from "node:path";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import {
  create,
  fetchAsset,
  mplCore,
  updatePlugin,
} from "@metaplex-foundation/mpl-core";
import {
  generateSigner,
  keypairIdentity,
  publicKey,
  type Umi,
} from "@metaplex-foundation/umi";
import { base58 } from "@metaplex-foundation/umi/serializers";
import { explorerUrl } from "./explorer";

export { explorerUrl };

/**
 * Public api.*.solana.com returns 403 from Cloudflare Workers.
 * Default to MagicBlock's keyless devnet RPC (verified from Worker egress).
 * Override with SOLANA_RPC_URL for Helius/QuickNode/etc.
 */
export const DEFAULT_SOLANA_RPC_URL = "https://rpc.magicblock.app/devnet";
export const RPC_URL = process.env.SOLANA_RPC_URL?.trim() || DEFAULT_SOLANA_RPC_URL;
export const CLUSTER = process.env.SOLANA_CLUSTER ?? "devnet";
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";

declare global {
  var __foodtrace_umi_by_key: Map<string, Umi> | undefined;
}

function secretFingerprint(secret: Uint8Array): string {
  return Buffer.from(secret).toString("base64");
}

function parseSecretKeyJson(raw: string): Uint8Array {
  return Uint8Array.from(JSON.parse(raw) as number[]);
}

/**
 * All server signers. First entry is the mint/payer identity.
 * Prefer SERVER_KEYPAIRS_JSON (JSON array of secret-key arrays) so older mint
 * authorities stay available for UpdatePlugin on demo batches.
 * Falls back to SERVER_KEYPAIR_JSON or SERVER_KEYPAIR_PATH.
 */
export function loadServerSecretKeys(): Uint8Array[] {
  const multi = process.env.SERVER_KEYPAIRS_JSON?.trim();
  if (multi) {
    const parsed = JSON.parse(multi) as number[][];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error("SERVER_KEYPAIRS_JSON must be a non-empty JSON array of secret keys");
    }
    return parsed.map((k) => Uint8Array.from(k));
  }
  return [loadServerSecretKey()];
}

/** Workers have no filesystem — prefer SERVER_KEYPAIR_JSON; path is for local/dev. */
export function loadServerSecretKey(): Uint8Array {
  const fromEnv = process.env.SERVER_KEYPAIR_JSON?.trim();
  if (fromEnv) {
    return parseSecretKeyJson(fromEnv);
  }
  const kpPath = path.resolve(/*turbopackIgnore: true*/
    process.cwd(),
    process.env.SERVER_KEYPAIR_PATH ?? ".keys/server.json",
  );
  return parseSecretKeyJson(readFileSync(kpPath, "utf8"));
}

function umiCache(): Map<string, Umi> {
  if (!globalThis.__foodtrace_umi_by_key) {
    globalThis.__foodtrace_umi_by_key = new Map();
  }
  return globalThis.__foodtrace_umi_by_key;
}

export function umiForSecret(secret: Uint8Array): Umi {
  const fp = secretFingerprint(secret);
  const cached = umiCache().get(fp);
  if (cached) return cached;
  const u = createUmi(RPC_URL).use(mplCore());
  u.use(keypairIdentity(u.eddsa.createKeypairFromSecretKey(secret)));
  umiCache().set(fp, u);
  return u;
}

/** Primary signer (first key) — used for minting new batches. */
export function umi(): Umi {
  return umiForSecret(loadServerSecretKeys()[0]!);
}

export function serverAddress() {
  return umi().identity.publicKey.toString();
}

/** Pick the server key whose pubkey matches the asset update authority. */
export async function umiForAsset(assetAddr: string): Promise<Umi> {
  const keys = loadServerSecretKeys();
  const probe = umiForSecret(keys[0]!);
  const asset = await fetchAsset(probe, publicKey(assetAddr));
  const ua = asset.updateAuthority;
  const authority =
    ua?.type === "Address" && ua.address ? String(ua.address) : null;
  if (!authority) return probe;
  for (const secret of keys) {
    const u = umiForSecret(secret);
    if (String(u.identity.publicKey) === authority) return u;
  }
  throw new Error(
    `no server key matches update authority ${authority} for asset ${assetAddr}`,
  );
}

function sigToString(sig: Uint8Array) {
  return base58.deserialize(sig)[0];
}

export type Attr = { key: string; value: string };

export function isBlockhashExpiredError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /block height exceeded|blockhash not found|BlockhashNotFound|BlockHeightExceeded/i.test(
    msg,
  );
}

type SendConfirmResult = { signature: Uint8Array };

/**
 * Rebuild + resend on expired blockhash. Cloudflare Worker → RPC latency often
 * burns the ~60–90s blockhash window on the first attempt.
 */
export async function sendWithBlockhashRetry(
  u: Umi,
  build: () => {
    sendAndConfirm: (
      umi: Umi,
      options?: {
        send?: { maxRetries?: number; preflightCommitment?: "processed" | "confirmed" | "finalized" };
        confirm?: { commitment?: "processed" | "confirmed" | "finalized" };
      },
    ) => Promise<SendConfirmResult>;
  },
  retries = 3,
): Promise<SendConfirmResult> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await build().sendAndConfirm(u, {
        send: { maxRetries: 5, preflightCommitment: "confirmed" },
        confirm: { commitment: "confirmed" },
      });
    } catch (e) {
      lastErr = e;
      if (!isBlockhashExpiredError(e) || attempt >= retries - 1) throw e;
      await sleep(400 * 2 ** attempt);
    }
  }
  throw lastErr;
}

/** Mint one Core NFT for a batch. Initial attributes hold batch identity. */
export async function mintBatchNft(input: {
  batchId: string;
  name: string;
  origin: string;
}) {
  const u = umi();
  const asset = generateSigner(u);
  const attributeList: Attr[] = [
    { key: "batch_id", value: input.batchId },
    { key: "origin", value: input.origin },
    { key: "created_at", value: String(Date.now()) },
  ];
  const { signature } = await sendWithBlockhashRetry(u, () =>
    create(u, {
      asset,
      name: `FoodTrace ${input.name} #${input.batchId}`,
      uri: `${BASE_URL}/api/metadata/${input.batchId}`,
      plugins: [{ type: "Attributes", attributeList }],
    }),
  );
  return { asset: asset.publicKey.toString(), signature: sigToString(signature) };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Public devnet RPC load-balances across nodes with slightly lagged state,
 * so a freshly-finalized account can 404 for a few seconds on the next read.
 * Retry with backoff instead of surfacing a false "chain unreachable".
 */
export async function readAttributes(
  assetAddr: string,
  retries = 4,
): Promise<Attr[]> {
  for (let attempt = 0; ; attempt++) {
    try {
      const a = await fetchAsset(umi(), publicKey(assetAddr));
      return (a.attributes?.attributeList ?? []).map((x) => ({
        key: x.key,
        value: x.value,
      }));
    } catch (e) {
      const notFound = e instanceof Error && /was not found at the provided address/.test(e.message);
      if (!notFound || attempt >= retries) throw e;
      await sleep(500 * 2 ** attempt);
    }
  }
}

export const stageKey = (stage: number) => `stage:${stage}`;
// snapshotHash is optional in the string format (empty segment) so stages recorded before the
// org-snapshot feature shipped still parse — they just show no snapshot hash to verify against.
export const stageValue = (photoHash: string, ts: number, actor: string, snapshotHash = "") =>
  `${photoHash}|${ts}|${actor}|${snapshotHash}`;

export function parseStageValue(v: string) {
  const [photoHash, ts, actor = "", snapshotHash = ""] = v.split("|");
  return { photoHash, ts: Number(ts), actor, snapshotHash };
}

/** Append a stage record to the NFT's on-chain attributes (full-list replace). */
export async function recordStageOnChain(input: {
  asset: string;
  stage: number;
  photoHash: string;
  ts: number;
  actor: string;
  /** sha256 of the JSON-encoded org snapshot (see snapshotOrgForStage) — lets verify/[id]
   * confirm the stored snapshot wasn't altered, the same way photoHash already does for photos. */
  snapshotHash: string;
}) {
  const keys = loadServerSecretKeys();
  const probe = umiForSecret(keys[0]!);
  const assetPk = publicKey(input.asset);
  const asset = await fetchAsset(probe, assetPk);
  const ua = asset.updateAuthority;
  const authority =
    ua?.type === "Address" && ua.address ? String(ua.address) : null;
  let u = probe;
  if (authority) {
    const match = keys.find(
      (secret) => String(umiForSecret(secret).identity.publicKey) === authority,
    );
    if (!match) {
      throw new Error(
        `no server key matches update authority ${authority} for asset ${input.asset}`,
      );
    }
    u = umiForSecret(match);
  }

  const current = (asset.attributes?.attributeList ?? []).map((x) => ({
    key: x.key,
    value: x.value,
  }));
  const key = stageKey(input.stage);
  if (current.some((a) => a.key === key)) {
    throw new Error(`stage ${input.stage} already on-chain`);
  }
  const attributeList = [
    ...current,
    { key, value: stageValue(input.photoHash, input.ts, input.actor, input.snapshotHash) },
  ];
  try {
    const { signature } = await sendWithBlockhashRetry(u, () =>
      updatePlugin(u, {
        asset: assetPk,
        plugin: { type: "Attributes", attributeList },
      }),
    );
    return { signature: sigToString(signature) };
  } catch (e) {
    // Tx often lands before confirm notices expiry — treat present stage attr as success.
    if (isBlockhashExpiredError(e)) {
      const attrs = await readAttributes(input.asset);
      const wrote = attrs.find((a) => a.key === key);
      if (wrote) {
        return { signature: "", recovered: true as const };
      }
    }
    throw e;
  }
}
