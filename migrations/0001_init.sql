-- FoodTrace schema for Cloudflare D1 (SQLite).

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
