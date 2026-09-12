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

function parseOrgSnapshot(json: string): Record<string, string | number> | undefined {
  try {
    return JSON.parse(json);
  } catch {
    return undefined;
  }
}

export default async function VerifyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (id.toLowerCase() === "demo") return <TracePreview liveData={null} />;
  const batch = await getBatch(id.toUpperCase());
  if (!batch) notFound();

  const local = await listStages(batch.id);
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
      // Old stages recorded before the org-snapshot feature shipped have no on-chain snapshot
      // hash to check against (parseStageValue defaults it to "") — treat that as "nothing to
      // verify" rather than tampered, and keep it independent of the primary photo match above.
      const orgSnapshot = row ? parseOrgSnapshot(row.org_snapshot) : undefined;
      const snapshotHash = row ? createHash("sha256").update(row.org_snapshot).digest("hex") : null;
      const snapshotMatch = row ? !parsed?.snapshotHash || snapshotHash === parsed.snapshotHash : undefined;
      const lat = orgSnapshot?.location_lat;
      const lng = orgSnapshot?.location_lng;
      const hasLocation = typeof lat === "number" && typeof lng === "number";
      return {
        s,
        row,
        parsed,
        fileHash,
        match,
        photoUrl: row ? `/api/uploads/${row.photo_file}` : undefined,
        txUrl: row ? explorerUrl("tx", row.tx_sig) : undefined,
        location: hasLocation ? {
          lat,
          lng,
          label: typeof orgSnapshot?.grid_region === "string" ? orgSnapshot.grid_region : row!.actor,
        } : undefined,
        orgSnapshot,
        snapshotMatch,
      };
    }),
  );
  return (
    <TracePreview
      key={batch.id}
      liveData={{
        batch,
        rows,
        chainErr,
        assetUrl: explorerUrl("address", batch.asset),
        mintUrl: explorerUrl("tx", batch.mint_sig),
      }}
    />
  );
}
