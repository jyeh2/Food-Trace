import {
  getBatch,
  getBatchReport,
  getOrgById,
  listStages,
  toPublicOrg,
  upsertBatchReport,
  type PublicOrg,
} from "@/lib/db";
import { buildReportFingerprint } from "@/lib/report-fingerprint";
import { parseBatchReport, type BatchReportData } from "@/lib/report-schema";

async function relatedOrgs(batchId: string, farmerOrgId: string | null): Promise<PublicOrg[]> {
  const stages = await listStages(batchId);
  const ids = new Set<string>();
  if (farmerOrgId) ids.add(farmerOrgId);
  for (const s of stages) {
    if (s.actor_org_id) ids.add(s.actor_org_id);
  }
  const orgs: PublicOrg[] = [];
  for (const id of ids) {
    const row = await getOrgById(id);
    if (row) orgs.push(toPublicOrg(row));
  }
  return orgs;
}

export async function computeReportFingerprint(batchId: string): Promise<{
  id: string;
  fingerprint: string;
} | { error: "not_found" }> {
  const id = batchId.toUpperCase();
  const batch = await getBatch(id);
  if (!batch) return { error: "not_found" };
  const stages = await listStages(id);
  const orgs = await relatedOrgs(id, batch.farmer_org_id);
  return { id, fingerprint: buildReportFingerprint({ batch, stages, orgs }) };
}

/** Serve cache only — never calls the model. */
export async function loadCachedReport(
  batchId: string,
): Promise<
  | { ok: true; report: BatchReportData; model: string; fingerprint: string }
  | { ok: true; report: null; model: null; fingerprint: string }
  | { ok: false; error: string }
> {
  const fp = await computeReportFingerprint(batchId);
  if ("error" in fp) return { ok: false, error: "not_found" };

  const cached = await getBatchReport(fp.id);
  if (cached && cached.fingerprint === fp.fingerprint) {
    try {
      return {
        ok: true,
        report: parseBatchReport(cached.report_json),
        model: cached.model,
        fingerprint: fp.fingerprint,
      };
    } catch {
      // fall through to miss
    }
  }

  return {
    ok: true,
    report: null,
    model: null,
    fingerprint: fp.fingerprint,
  };
}

export async function saveGeneratedReport(opts: {
  batchId: string;
  report: BatchReportData;
  model: string;
  fingerprint?: string;
}): Promise<void> {
  const id = opts.batchId.toUpperCase();
  let fingerprint = opts.fingerprint;
  if (!fingerprint) {
    const fp = await computeReportFingerprint(id);
    if ("error" in fp) throw new Error("batch not found");
    fingerprint = fp.fingerprint;
  }
  const now = Date.now();
  const existing = await getBatchReport(id);
  await upsertBatchReport({
    batch_id: id,
    fingerprint,
    report_json: JSON.stringify(opts.report),
    model: opts.model,
    created_at: existing?.created_at ?? now,
    updated_at: now,
  });
}

/** @deprecated Prefer loadCachedReport + stream route. Kept for tests/compat. */
export async function loadOrGenerateReport(
  batchId: string,
  opts: { refresh: boolean },
): Promise<
  | { ok: true; report: BatchReportData; cached: boolean; model: string }
  | { ok: false; error: string }
> {
  if (!opts.refresh) {
    const cached = await loadCachedReport(batchId);
    if (!cached.ok) return cached;
    if (cached.report) {
      return {
        ok: true,
        report: cached.report,
        cached: true,
        model: cached.model!,
      };
    }
  }

  try {
    const { generateBatchReport } = await import("@/lib/report-agent");
    const { report, model } = await generateBatchReport(batchId);
    await saveGeneratedReport({ batchId, report, model });
    return { ok: true, report, cached: false, model };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
