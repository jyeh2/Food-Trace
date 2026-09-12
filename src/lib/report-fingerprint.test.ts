import { describe, expect, it } from "vitest";
import { buildReportFingerprint } from "./report-fingerprint";
import type { BatchRow, PublicOrg, StageRow } from "./db";

const batch: BatchRow = {
  id: "ABCD",
  name: "Berries",
  origin: "PA",
  asset: "asset1",
  mint_sig: "mint1",
  created_at: 100,
  farmer_org_id: "org1",
};

const stage1: StageRow = {
  id: 1,
  batch_id: "ABCD",
  stage: 1,
  photo_file: "a.jpg",
  photo_hash: "hash1",
  note: "n",
  actor: "Alice",
  tx_sig: "tx1",
  created_at: 200,
  actor_org_id: "org1",
};

const org: PublicOrg = {
  id: "org1",
  name: "Green Acres",
  role: "FARMER",
  public_key: null,
  contact_email: "farm@example.com",
  phone: null,
  location_lat: 40.44,
  location_lng: -79.94,
  grid_region: "RFC",
  certifications: '["USDA Organic"]',
  verification_status: "verified",
  active: 1,
  created_at: 1,
  farm_type: null,
  livestock_type: null,
  breed: null,
  herd_size: null,
  avg_weight_kg: null,
  feed_type: null,
  feed_source: null,
  land_area_hectares: null,
  land_use_type: null,
  farming_practice: null,
  onsite_renewable_pct: null,
  facility_type: null,
  facility_energy_source: null,
  facility_renewable_pct: null,
  fleet_type: null,
  refrigeration_type: null,
  processing_capacity_kg_per_day: null,
  default_transport_mode: null,
  buyer_type: null,
  storage_type: null,
  avg_storage_duration_days: null,
  cooking_method: null,
  kitchen_energy_source: null,
  sustainability_program: null,
};

describe("buildReportFingerprint", () => {
  it("is stable for identical inputs", () => {
    const a = buildReportFingerprint({ batch, stages: [stage1], orgs: [org] });
    const b = buildReportFingerprint({ batch, stages: [stage1], orgs: [org] });
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });

  it("changes when a stage photo_hash changes", () => {
    const a = buildReportFingerprint({ batch, stages: [stage1], orgs: [org] });
    const b = buildReportFingerprint({
      batch,
      stages: [{ ...stage1, photo_hash: "hash2" }],
      orgs: [org],
    });
    expect(a).not.toBe(b);
  });

  it("changes when an org certification changes", () => {
    const a = buildReportFingerprint({ batch, stages: [stage1], orgs: [org] });
    const b = buildReportFingerprint({
      batch,
      stages: [stage1],
      orgs: [{ ...org, certifications: "[]" }],
    });
    expect(a).not.toBe(b);
  });
});
