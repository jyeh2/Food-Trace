import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";
import type { OrgRole } from "@/lib/orgs";

const DATA_DIR = path.join(process.cwd(), "data");
export const UPLOAD_DIR = path.join(DATA_DIR, "uploads");

/** Shared by the initial CREATE TABLE and the role-split migration rebuild below — keep in sync. */
const ORGS_TABLE_COLUMNS_SQL = `
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

declare global {
  var __foodtrace_db: Database.Database | undefined;
}

function columnExists(db: Database.Database, table: string, column: string) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return cols.some((c) => c.name === column);
}

function open() {
  mkdirSync(UPLOAD_DIR, { recursive: true });
  const db = new Database(path.join(DATA_DIR, "foodtrace.db"));
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS batches (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      origin TEXT NOT NULL,
      asset TEXT NOT NULL,
      mint_sig TEXT NOT NULL,
      created_at INTEGER NOT NULL
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
      UNIQUE(batch_id, stage)
    );
    CREATE TABLE IF NOT EXISTS orgs (${ORGS_TABLE_COLUMNS_SQL});
  `);
  // Migrate columns onto tables that may already exist from before orgs were introduced.
  if (!columnExists(db, "batches", "farmer_org_id")) {
    db.exec(`ALTER TABLE batches ADD COLUMN farmer_org_id TEXT REFERENCES orgs(id)`);
  }
  if (!columnExists(db, "stages", "actor_org_id")) {
    db.exec(`ALTER TABLE stages ADD COLUMN actor_org_id TEXT REFERENCES orgs(id)`);
  }
  // SQLite can't ALTER a CHECK constraint in place — rebuild the table if an
  // older orgs table predates the PROCESSOR/DISTRIBUTOR role split.
  const orgsSql = (db.prepare(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='orgs'",
  ).get() as { sql: string } | undefined)?.sql;
  if (orgsSql && !orgsSql.includes("PROCESSOR")) {
    const cols = ORG_COLUMNS.join(",");
    // Renaming orgs itself would rewrite batches/stages' FK clauses to point
    // at the renamed name (SQLite auto-fixes references on ALTER TABLE
    // RENAME), leaving them referencing a name we're about to drop. Building
    // the replacement under a fresh name and swapping it in after dropping
    // the old orgs avoids ever renaming the table other tables reference, so
    // their "REFERENCES orgs(id)" clauses are never touched. foreign_keys
    // must be off for the DROP, since batches/stages still hold rows
    // referencing it.
    db.pragma("foreign_keys = OFF");
    db.exec(`
      CREATE TABLE orgs_new (${ORGS_TABLE_COLUMNS_SQL});
      INSERT INTO orgs_new (${cols}) SELECT ${cols} FROM orgs;
      DROP TABLE orgs;
      ALTER TABLE orgs_new RENAME TO orgs;
    `);
    db.pragma("foreign_keys = ON");
  }
  return db;
}

export function db() {
  if (!globalThis.__foodtrace_db) globalThis.__foodtrace_db = open();
  return globalThis.__foodtrace_db;
}

export function listBatches(): BatchRow[] {
  return db()
    .prepare("SELECT * FROM batches ORDER BY created_at DESC")
    .all() as BatchRow[];
}

export function getBatch(id: string): BatchRow | undefined {
  return db().prepare("SELECT * FROM batches WHERE id = ?").get(id) as
    | BatchRow
    | undefined;
}

export function insertBatch(b: BatchRow) {
  db()
    .prepare(
      "INSERT INTO batches (id,name,origin,asset,mint_sig,created_at,farmer_org_id) VALUES (@id,@name,@origin,@asset,@mint_sig,@created_at,@farmer_org_id)",
    )
    .run(b);
}

export function listStages(batchId: string): StageRow[] {
  return db()
    .prepare("SELECT * FROM stages WHERE batch_id = ? ORDER BY stage ASC")
    .all(batchId) as StageRow[];
}

export function lastStage(batchId: string): number {
  const row = db()
    .prepare("SELECT MAX(stage) AS m FROM stages WHERE batch_id = ?")
    .get(batchId) as { m: number | null };
  return row.m ?? 0;
}

export function insertStage(s: Omit<StageRow, "id">) {
  db()
    .prepare(
      "INSERT INTO stages (batch_id,stage,photo_file,photo_hash,note,actor,tx_sig,created_at,actor_org_id) VALUES (@batch_id,@stage,@photo_file,@photo_hash,@note,@actor,@tx_sig,@created_at,@actor_org_id)",
    )
    .run(s);
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

export function insertOrg(o: OrgRow) {
  const cols = ORG_COLUMNS.join(",");
  const placeholders = ORG_COLUMNS.map((c) => `@${c}`).join(",");
  db().prepare(`INSERT INTO orgs (${cols}) VALUES (${placeholders})`).run(o);
}

export function getOrgById(id: string): OrgRow | undefined {
  return db().prepare("SELECT * FROM orgs WHERE id = ?").get(id) as OrgRow | undefined;
}

export function getOrgByEmail(email: string): OrgRow | undefined {
  return db()
    .prepare("SELECT * FROM orgs WHERE contact_email = ?")
    .get(email) as OrgRow | undefined;
}

export function listOrgs(): OrgRow[] {
  return db().prepare("SELECT * FROM orgs ORDER BY created_at DESC").all() as OrgRow[];
}
