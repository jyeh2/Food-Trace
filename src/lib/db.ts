import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), "data");
export const UPLOAD_DIR = path.join(DATA_DIR, "uploads");

export type BatchRow = {
  id: string;
  name: string;
  origin: string;
  asset: string; // NFT asset pubkey
  mint_sig: string;
  created_at: number;
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
};

declare global {
  var __foodtrace_db: Database.Database | undefined;
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
  `);
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
      "INSERT INTO batches (id,name,origin,asset,mint_sig,created_at) VALUES (@id,@name,@origin,@asset,@mint_sig,@created_at)",
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
      "INSERT INTO stages (batch_id,stage,photo_file,photo_hash,note,actor,tx_sig,created_at) VALUES (@batch_id,@stage,@photo_file,@photo_hash,@note,@actor,@tx_sig,@created_at)",
    )
    .run(s);
}
