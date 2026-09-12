import { createHash } from "node:crypto";
import type { BatchRow, PublicOrg, StageRow } from "@/lib/db";

function orgSlice(o: PublicOrg) {
  return {
    id: o.id,
    name: o.name,
    role: o.role,
    certifications: o.certifications,
    verification_status: o.verification_status,
    location_lat: o.location_lat,
    location_lng: o.location_lng,
    grid_region: o.grid_region,
  };
}

export function buildReportFingerprint(input: {
  batch: BatchRow;
  stages: StageRow[];
  orgs: PublicOrg[];
}): string {
  const payload = {
    batch: {
      id: input.batch.id,
      name: input.batch.name,
      origin: input.batch.origin,
      asset: input.batch.asset,
      mint_sig: input.batch.mint_sig,
      farmer_org_id: input.batch.farmer_org_id,
      created_at: input.batch.created_at,
    },
    stages: [...input.stages]
      .sort((a, b) => a.stage - b.stage)
      .map((s) => ({
        id: s.id,
        stage: s.stage,
        photo_hash: s.photo_hash,
        note: s.note,
        actor: s.actor,
        actor_org_id: s.actor_org_id,
        tx_sig: s.tx_sig,
        created_at: s.created_at,
      })),
    orgs: [...input.orgs]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map(orgSlice),
  };
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}
