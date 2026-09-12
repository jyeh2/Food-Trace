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
  }).sendAndConfirm(u);
  return { asset: asset.publicKey.toString(), signature: sigToString(signature) };
}

export async function readAttributes(assetAddr: string): Promise<Attr[]> {
  const a = await fetchAsset(umi(), publicKey(assetAddr));
  return (a.attributes?.attributeList ?? []).map((x) => ({
    key: x.key,
    value: x.value,
  }));
}

export const stageKey = (stage: number) => `stage:${stage}`;
export const stageValue = (photoHash: string, ts: number, actor: string) =>
  `${photoHash}|${ts}|${actor}`;

export function parseStageValue(v: string) {
  const [photoHash, ts, actor = ""] = v.split("|");
  return { photoHash, ts: Number(ts), actor };
}

/** Append a stage record to the NFT's on-chain attributes (full-list replace). */
export async function recordStageOnChain(input: {
  asset: string;
  stage: number;
  photoHash: string;
  ts: number;
  actor: string;
}) {
  const u = umi();
  const current = await readAttributes(input.asset);
  const key = stageKey(input.stage);
  if (current.some((a) => a.key === key)) {
    throw new Error(`stage ${input.stage} already on-chain`);
  }
  const attributeList = [
    ...current,
    { key, value: stageValue(input.photoHash, input.ts, input.actor) },
  ];
  const { signature } = await updatePlugin(u, {
    asset: publicKey(input.asset),
    plugin: { type: "Attributes", attributeList },
  }).sendAndConfirm(u);
  return { signature: sigToString(signature) };
}
