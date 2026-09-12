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

export const RPC_URL =
  process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
export const CLUSTER = process.env.SOLANA_CLUSTER ?? "devnet";
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";

declare global {
  var __foodtrace_umi: Umi | undefined;
}

export function umi(): Umi {
  if (globalThis.__foodtrace_umi) return globalThis.__foodtrace_umi;
  const kpPath = path.resolve(/*turbopackIgnore: true*/
    process.cwd(),
    process.env.SERVER_KEYPAIR_PATH ?? ".keys/server.json",
  );
  const secret = Uint8Array.from(JSON.parse(readFileSync(kpPath, "utf8")));
  const u = createUmi(RPC_URL).use(mplCore());
  u.use(keypairIdentity(u.eddsa.createKeypairFromSecretKey(secret)));
  globalThis.__foodtrace_umi = u;
  return u;
}

export function serverAddress() {
  return umi().identity.publicKey.toString();
}

export function explorerUrl(kind: "address" | "tx", id: string) {
  return `https://explorer.solana.com/${kind}/${id}?cluster=${CLUSTER}`;
}

function sigToString(sig: Uint8Array) {
  return base58.deserialize(sig)[0];
}

export type Attr = { key: string; value: string };

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
  const { signature } = await create(u, {
    asset,
    name: `FoodTrace ${input.name} #${input.batchId}`,
    uri: `${BASE_URL}/api/metadata/${input.batchId}`,
    plugins: [{ type: "Attributes", attributeList }],
  }).sendAndConfirm(u, { confirm: { commitment: "finalized" } });
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
  const u = umi();
  const current = await readAttributes(input.asset);
  const key = stageKey(input.stage);
  if (current.some((a) => a.key === key)) {
    throw new Error(`stage ${input.stage} already on-chain`);
  }
  const attributeList = [
    ...current,
    { key, value: stageValue(input.photoHash, input.ts, input.actor, input.snapshotHash) },
  ];
  const { signature } = await updatePlugin(u, {
    asset: publicKey(input.asset),
    plugin: { type: "Attributes", attributeList },
  }).sendAndConfirm(u);
  return { signature: sigToString(signature) };
}
