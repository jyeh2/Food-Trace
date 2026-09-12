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
import { generateBatchReport } from "@/lib/report-agent";
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

export async function loadOrGenerateReport(
  batchId: string,
  opts: { refresh: boolean },
): Promise<
  | { ok: true; report: BatchReportData; cached: boolean; model: string }
  | { ok: false; error: string }
> {
  const id = batchId.toUpperCase();
  const batch = await getBatch(id);
  if (!batch) return { ok: false, error: "not_found" };

  const stages = await listStages(id);
  const orgs = await relatedOrgs(id, batch.farmer_org_id);
  const fingerprint = buildReportFingerprint({ batch, stages, orgs });

  if (!opts.refresh) {
    const cached = await getBatchReport(id);
    if (cached && cached.fingerprint === fingerprint) {
      try {
        return {
          ok: true,
          report: parseBatchReport(cached.report_json),
          cached: true,
          model: cached.model,
        };
      } catch {
        // fall through to regenerate
      }
    }
  }

  try {
    const { report, model } = await generateBatchReport(id);
    const now = Date.now();
    const existing = await getBatchReport(id);
    await upsertBatchReport({
      batch_id: id,
      fingerprint,
      report_json: JSON.stringify(report),
      model,
      created_at: existing?.created_at ?? now,
      updated_at: now,
    });
    return { ok: true, report, cached: false, model };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
