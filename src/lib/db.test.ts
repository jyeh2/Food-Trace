import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OrgRow } from "./db";

function d1Success(results: unknown[] = []) {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => ({
      success: true,
      errors: [],
      messages: [],
      result: [{ success: true, results, meta: {} }],
    }),
  };
}

const sampleOrg: OrgRow = {
  id: "org1",
  name: "Green Acres",
  role: "FARMER",
  public_key: null,
  contact_email: "farm@example.com",
  phone: null,
  password_hash: "salt:hash",
  location_lat: 40.44,
  location_lng: -79.94,
  grid_region: "RFC",
  certifications: "[]",
  verification_status: "unverified",
  active: 1,
  created_at: 1,
  farm_type: "livestock",
  livestock_type: "cattle",
  breed: null,
  herd_size: 12,
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

describe("db over D1", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    process.env.CLOUDFLARE_ACCOUNT_ID = "a".repeat(32);
    process.env.CLOUDFLARE_API_TOKEN = "test-token";
    process.env.CLOUDFLARE_D1_DATABASE_ID = "5c1ae019-3071-4e88-9f91-b3da7ce6b2b8";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function loadDb() {
    const db = await import("./db");
    db.skipD1MigrateForTests();
    return db;
  }

  it("listBatches and getBatch are async D1 reads", async () => {
    const rows = [{ id: "AB12", name: "Tomatoes", origin: "PA", asset: "x", mint_sig: "y", created_at: 1, farmer_org_id: null }];
    fetchMock.mockResolvedValue(d1Success(rows));
    const { listBatches, getBatch } = await loadDb();
    expect(await listBatches()).toEqual(rows);
    expect(await getBatch("AB12")).toEqual(rows[0]);
    expect(fetchMock.mock.calls[0][1]).toEqual(expect.objectContaining({ method: "POST" }));
    expect(JSON.parse(String(fetchMock.mock.calls[0][1].body)).sql).toMatch(/FROM batches/i);
  });

  it("getBatch returns undefined when missing", async () => {
    fetchMock.mockResolvedValue(d1Success([]));
    const { getBatch } = await loadDb();
    expect(await getBatch("NOPE")).toBeUndefined();
  });

  it("insertBatch binds positional values including farmer_org_id", async () => {
    fetchMock.mockResolvedValue(d1Success());
    const { insertBatch } = await loadDb();
    await insertBatch({
      id: "AB12",
      name: "Tomatoes",
      origin: "PA",
      asset: "asset",
      mint_sig: "sig",
      created_at: 99,
      farmer_org_id: "org1",
    });
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(body.sql).toMatch(/INSERT INTO batches/i);
    expect(body.params).toEqual(["AB12", "Tomatoes", "PA", "asset", "sig", 99, "org1"]);
  });

  it("lastStage returns 0 when no stages exist", async () => {
    fetchMock.mockResolvedValue(d1Success([{ m: null }]));
    const { lastStage } = await loadDb();
    expect(await lastStage("AB12")).toBe(0);
  });

  it("insertOrg converts nullables and getOrgByEmail looks up by email", async () => {
    fetchMock.mockResolvedValue(d1Success());
    const db = await loadDb();
    await db.insertOrg(sampleOrg);
    const insertBody = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(insertBody.sql).toMatch(/INSERT INTO orgs/i);
    expect(insertBody.params[0]).toBe("org1");
    expect(insertBody.params).toContain(null);

    fetchMock.mockResolvedValue(d1Success([sampleOrg]));
    expect(await db.getOrgByEmail("farm@example.com")).toEqual(sampleOrg);
    const selectBody = JSON.parse(String(fetchMock.mock.calls[1][1].body));
    expect(selectBody.sql).toMatch(/contact_email/i);
    expect(selectBody.params).toEqual(["farm@example.com"]);
  });

  it("toPublicOrg strips password_hash", async () => {
    const { toPublicOrg } = await loadDb();
    const pub = toPublicOrg(sampleOrg);
    expect(pub).not.toHaveProperty("password_hash");
    expect(pub.contact_email).toBe("farm@example.com");
  });

  describe("batch_reports cache", () => {
    it("getBatchReport returns undefined when missing", async () => {
      fetchMock.mockResolvedValue(d1Success([]));
      const { getBatchReport } = await loadDb();
      expect(await getBatchReport("ABCD")).toBeUndefined();
    });

    it("upsertBatchReport binds all columns", async () => {
      fetchMock.mockResolvedValue(d1Success());
      const { upsertBatchReport } = await loadDb();
      await upsertBatchReport({
        batch_id: "ABCD",
        fingerprint: "fp",
        report_json: "{}",
        model: "openai/gpt-4o-mini",
        created_at: 1,
        updated_at: 2,
      });
      const body = JSON.parse(String(fetchMock.mock.calls[0][1].body));
      expect(body.sql).toMatch(/INSERT INTO batch_reports/i);
      expect(body.params).toEqual(["ABCD", "fp", "{}", "openai/gpt-4o-mini", 1, 2]);
    });
  });
});
