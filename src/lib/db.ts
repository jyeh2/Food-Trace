import { mkdirSync } from "node:fs";
import path from "node:path";
import type { OrgRole } from "./orgs";
import { d1All, d1First, d1Run, type SqlValue } from "./d1";

const DATA_DIR = path.join(process.cwd(), "data");
export const UPLOAD_DIR = path.join(DATA_DIR, "uploads");

/** Shared by schema create and the D1 HTTP migrate — keep in sync with migrations/0001_init.sql. */
const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS orgs (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('FARMER','PROCESSOR','DISTRIBUTOR','BUYER','SUPPLIER','ADMIN','AUDITOR')),
    public_key TEXT,
    contact_email TEXT NOT NULL UNIQUE,
    phone TEXT,
    password_hash TEXT NOT NULL,
    location_lat REAL,
    location_lng REAL,
    grid_region TEXT,
    certifications TEXT NOT NULL DEFAULT '[]',
    verification_status TEXT NOT NULL DEFAULT 'unverified' CHECK (verification_status IN ('verified','unverified')),
    active INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,

    farm_type TEXT,
    livestock_type TEXT,
    breed TEXT,
    herd_size INTEGER,
    avg_weight_kg REAL,
    feed_type TEXT,
    feed_source TEXT,
    land_area_hectares REAL,
    land_use_type TEXT,
    farming_practice TEXT,
    onsite_renewable_pct REAL,

    facility_type TEXT,
    facility_energy_source TEXT,
    facility_renewable_pct REAL,
    fleet_type TEXT,
    refrigeration_type TEXT,
    processing_capacity_kg_per_day REAL,
    default_transport_mode TEXT,

    buyer_type TEXT,
    storage_type TEXT,
    avg_storage_duration_days REAL,
    cooking_method TEXT,
    kitchen_energy_source TEXT,
    sustainability_program TEXT
  );
  CREATE TABLE IF NOT EXISTS batches (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    origin TEXT NOT NULL,
    asset TEXT NOT NULL,
    mint_sig TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    farmer_org_id TEXT REFERENCES orgs(id)
  );
  CREATE TABLE IF NOT EXISTS stages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_id TEXT NOT NULL REFERENCES batches(id),
    stage INTEGER NOT NULL,
    photo_file TEXT NOT NULL,
    photo_hash TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    actor TEXT NOT NULL DEFAULT '',
    tx_sig TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    actor_org_id TEXT REFERENCES orgs(id),
    UNIQUE(batch_id, stage)
  );
  CREATE TABLE IF NOT EXISTS batch_reports (
    batch_id TEXT PRIMARY KEY REFERENCES batches(id),
    fingerprint TEXT NOT NULL,
    report_json TEXT NOT NULL,
    model TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
`;

export type BatchRow = {
  id: string;
  name: string;
  origin: string;
  asset: string; // NFT asset pubkey
  mint_sig: string;
  created_at: number;
  farmer_org_id: string | null;
};

export type StageRow = {
  id: number;
  batch_id: string;
  stage: number;
  photo_file: string;
  photo_hash: string;
  note: string;
  actor: string;
  tx_sig: string;
  created_at: number;
  actor_org_id: string | null;
  /** JSON-encoded snapshot of the acting org's location + role-specific fields at record
   * time — see snapshotOrgForStage. Kept as one column rather than a field per possible
   * attribute so recording a stage never needs its own form. */
  org_snapshot: string;
};

/** Wide table: common fields + every role-specific field, nullable unless relevant to the org's role. */
export type OrgRow = {
  id: string;
  name: string;
  role: OrgRole;
  public_key: string | null;
  contact_email: string;
  phone: string | null;
  password_hash: string;
  location_lat: number | null;
  location_lng: number | null;
  grid_region: string | null;
  certifications: string; // JSON-encoded string[]
  verification_status: "verified" | "unverified";
  active: 0 | 1;
  created_at: number;

  // farmer-specific
  farm_type: string | null;
  livestock_type: string | null;
  breed: string | null;
  herd_size: number | null;
  avg_weight_kg: number | null;
  feed_type: string | null;
  feed_source: string | null;
  land_area_hectares: number | null;
  land_use_type: string | null;
  farming_practice: string | null;
  onsite_renewable_pct: number | null;

  // processor/distributor-specific (formerly "supplier")
  facility_type: string | null;
  facility_energy_source: string | null;
  facility_renewable_pct: number | null;
  fleet_type: string | null;
  refrigeration_type: string | null;
  processing_capacity_kg_per_day: number | null;
  default_transport_mode: string | null;

  // buyer-specific
  buyer_type: string | null;
  storage_type: string | null;
  avg_storage_duration_days: number | null;
  cooking_method: string | null;
  kitchen_energy_source: string | null;
  sustainability_program: string | null;
};

export type PublicOrg = Omit<OrgRow, "password_hash">;

export function toPublicOrg(o: OrgRow): PublicOrg {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { password_hash, ...rest } = o;
  return rest;
}

/** Which of an org's role-specific OrgRow fields get snapshotted onto each stage it records. */
const ROLE_SNAPSHOT_FIELDS: Record<OrgRole, (keyof OrgRow)[]> = {
  FARMER: ["farm_type", "land_use_type", "farming_practice", "onsite_renewable_pct"],
  PROCESSOR: ["facility_type", "facility_energy_source", "facility_renewable_pct"],
  DISTRIBUTOR: ["fleet_type", "refrigeration_type", "default_transport_mode"],
  BUYER: ["buyer_type", "storage_type", "kitchen_energy_source"],
  SUPPLIER: ["facility_type", "default_transport_mode"],
  ADMIN: [],
  AUDITOR: [],
};

/**
 * Snapshots an org's location + role-specific fields at the moment it records a stage, so a
 * stage keeps the provenance data that was true then even if the org edits its profile later.
 * Pulled straight from the org's existing profile — recording a stage never prompts for this,
 * which matters live at a demo station. Missing profile fields fall back to placeholders so the
 * snapshot is always presentable rather than full of nulls.
 */
export function snapshotOrgForStage(org: OrgRow): Record<string, string | number> {
  const snapshot: Record<string, string | number> = {
    grid_region: org.grid_region ?? "unspecified",
    location_lat: org.location_lat ?? 0,
    location_lng: org.location_lng ?? 0,
  };
  for (const field of ROLE_SNAPSHOT_FIELDS[org.role]) {
    const value = org[field];
    snapshot[field] = value === null || value === undefined ? "unspecified" : value;
  }
  return snapshot;
}

declare global {
  var __foodtrace_d1_ready: Promise<void> | undefined;
}

function sqlValue(v: unknown): SqlValue {
  if (v === undefined || v === null) return null;
  if (typeof v === "number" || typeof v === "string") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  return String(v);
}

async function columnExists(table: string, column: string) {
  const cols = await d1All<{ name: string }>(`PRAGMA table_info(${table})`);
  return cols.some((c) => c.name === column);
}

async function migrate() {
  await d1Run(SCHEMA_SQL);
  if (!(await columnExists("batches", "farmer_org_id"))) {
    await d1Run("ALTER TABLE batches ADD COLUMN farmer_org_id TEXT REFERENCES orgs(id)");
  }
  if (!(await columnExists("stages", "actor_org_id"))) {
    await d1Run("ALTER TABLE stages ADD COLUMN actor_org_id TEXT REFERENCES orgs(id)");
  }
}

/** Test-only: skip CREATE TABLE / ALTER against D1 so unit tests can mock individual queries. */
export function skipD1MigrateForTests() {
  globalThis.__foodtrace_d1_ready = Promise.resolve();
}

async function ready() {
  mkdirSync(UPLOAD_DIR, { recursive: true });
  if (!globalThis.__foodtrace_d1_ready) {
    globalThis.__foodtrace_d1_ready = migrate();
  }
  await globalThis.__foodtrace_d1_ready;
}

export async function listBatches(): Promise<BatchRow[]> {
  await ready();
  return d1All<BatchRow>("SELECT * FROM batches ORDER BY created_at DESC");
}

export async function getBatch(id: string): Promise<BatchRow | undefined> {
  await ready();
  return d1First<BatchRow>("SELECT * FROM batches WHERE id = ?", [id]);
}

export async function insertBatch(b: BatchRow) {
  await ready();
  await d1Run(
    "INSERT INTO batches (id,name,origin,asset,mint_sig,created_at,farmer_org_id) VALUES (?,?,?,?,?,?,?)",
    [b.id, b.name, b.origin, b.asset, b.mint_sig, b.created_at, b.farmer_org_id],
  );
}

export async function listStages(batchId: string): Promise<StageRow[]> {
  await ready();
  return d1All<StageRow>("SELECT * FROM stages WHERE batch_id = ? ORDER BY stage ASC", [batchId]);
}

export async function lastStage(batchId: string): Promise<number> {
  await ready();
  const row = await d1First<{ m: number | null }>(
    "SELECT MAX(stage) AS m FROM stages WHERE batch_id = ?",
    [batchId],
  );
  return row?.m ?? 0;
}

export async function insertStage(s: Omit<StageRow, "id">) {
  await ready();
  await d1Run(
    "INSERT INTO stages (batch_id,stage,photo_file,photo_hash,note,actor,tx_sig,created_at,actor_org_id) VALUES (?,?,?,?,?,?,?,?,?)",
    [
      s.batch_id,
      s.stage,
      s.photo_file,
      s.photo_hash,
      s.note,
      s.actor,
      s.tx_sig,
      s.created_at,
      s.actor_org_id,
    ],
  );
}

const ORG_COLUMNS = [
  "id", "name", "role", "public_key", "contact_email", "phone", "password_hash",
  "location_lat", "location_lng", "grid_region", "certifications", "verification_status",
  "active", "created_at",
  "farm_type", "livestock_type", "breed", "herd_size", "avg_weight_kg", "feed_type",
  "feed_source", "land_area_hectares", "land_use_type", "farming_practice", "onsite_renewable_pct",
  "facility_type", "facility_energy_source", "facility_renewable_pct", "fleet_type",
  "refrigeration_type", "processing_capacity_kg_per_day", "default_transport_mode",
  "buyer_type", "storage_type", "avg_storage_duration_days", "cooking_method",
  "kitchen_energy_source", "sustainability_program",
] as const;

export async function insertOrg(o: OrgRow) {
  await ready();
  const cols = ORG_COLUMNS.join(",");
  const placeholders = ORG_COLUMNS.map(() => "?").join(",");
  await d1Run(
    `INSERT INTO orgs (${cols}) VALUES (${placeholders})`,
    ORG_COLUMNS.map((c) => sqlValue(o[c])),
  );
}

export async function getOrgById(id: string): Promise<OrgRow | undefined> {
  await ready();
  return d1First<OrgRow>("SELECT * FROM orgs WHERE id = ?", [id]);
}

export async function getOrgByEmail(email: string): Promise<OrgRow | undefined> {
  await ready();
  return d1First<OrgRow>("SELECT * FROM orgs WHERE contact_email = ?", [email]);
}

export async function listOrgs(): Promise<OrgRow[]> {
  await ready();
  return d1All<OrgRow>("SELECT * FROM orgs ORDER BY created_at DESC");
}

export type BatchReportRow = {
  batch_id: string;
  fingerprint: string;
  report_json: string;
  model: string;
  created_at: number;
  updated_at: number;
};

export async function getBatchReport(batchId: string): Promise<BatchReportRow | undefined> {
  await ready();
  return d1First<BatchReportRow>("SELECT * FROM batch_reports WHERE batch_id = ?", [batchId]);
}

export async function upsertBatchReport(row: BatchReportRow) {
  await ready();
  await d1Run(
    `INSERT INTO batch_reports (batch_id, fingerprint, report_json, model, created_at, updated_at)
     VALUES (?,?,?,?,?,?)
     ON CONFLICT(batch_id) DO UPDATE SET
       fingerprint=excluded.fingerprint,
       report_json=excluded.report_json,
       model=excluded.model,
       updated_at=excluded.updated_at`,
    [row.batch_id, row.fingerprint, row.report_json, row.model, row.created_at, row.updated_at],
  );
}
