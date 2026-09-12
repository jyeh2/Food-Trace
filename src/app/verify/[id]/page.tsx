import { notFound } from "next/navigation";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { UPLOAD_DIR, getBatch, listStages } from "@/lib/db";
import TracePreview from "./TracePreview";
import { STAGES } from "@/lib/stages";
import { explorerUrl, parseStageValue, readAttributes, stageKey } from "@/lib/solana";

export const dynamic = "force-dynamic";

async function hashFile(file: string) {
  try {
    const b = await readFile(path.join(UPLOAD_DIR, file));
    return createHash("sha256").update(b).digest("hex");
  } catch {
    return null;
  }
}

export default async function VerifyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (id.toLowerCase() === "demo") return <TracePreview liveData={null} />;
  const batch = getBatch(id.toUpperCase());
  if (!batch) notFound();

  const local = listStages(batch.id);
  let chain: Awaited<ReturnType<typeof readAttributes>> = [];
  let chainErr = "";
  try {
    chain = await readAttributes(batch.asset);
  } catch (e) {
    chainErr = e instanceof Error ? e.message : String(e);
  }

  const rows = await Promise.all(
    STAGES.map(async (s) => {
      const row = local.find((r) => r.stage === s.id);
      const onChain = chain.find((a) => a.key === stageKey(s.id));
      const parsed = onChain ? parseStageValue(onChain.value) : null;
      const fileHash = row ? await hashFile(row.photo_file) : null;
      const match = !!row && !!parsed && fileHash === parsed.photoHash;
      return { s, row, parsed, fileHash, match, photoUrl: row ? `/api/uploads/${row.photo_file}` : undefined, txUrl: row ? explorerUrl("tx", row.tx_sig) : undefined };
    }),
  );
  return <TracePreview key={batch.id} liveData={{ batch, rows, chainErr, assetUrl: explorerUrl("address", batch.asset), mintUrl: explorerUrl("tx", batch.mint_sig) }} />;
}
