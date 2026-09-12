CREATE TABLE IF NOT EXISTS batch_reports (
  batch_id TEXT PRIMARY KEY REFERENCES batches(id),
  fingerprint TEXT NOT NULL,
  report_json TEXT NOT NULL,
  model TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
