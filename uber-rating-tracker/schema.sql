-- Uber Rating Tracker / Cloudflare D1 schema
-- 保存するのは評価数字と配達メモのみ。スクショ画像はアップロードしません。

CREATE TABLE IF NOT EXISTS rating_snapshots (
  id TEXT PRIMARY KEY,
  recorded_at INTEGER NOT NULL,
  satisfaction INTEGER,
  merchant_good INTEGER DEFAULT 0,
  merchant_bad INTEGER DEFAULT 0,
  customer_good INTEGER DEFAULT 0,
  customer_bad INTEGER DEFAULT 0,
  total_good INTEGER DEFAULT 0,
  total_bad INTEGER DEFAULT 0,
  delta_good INTEGER DEFAULT 0,
  delta_bad INTEGER DEFAULT 0,
  source_device TEXT DEFAULT '',
  note TEXT DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rating_snapshots_recorded_at
ON rating_snapshots(recorded_at DESC);

CREATE TABLE IF NOT EXISTS deliveries (
  id TEXT PRIMARY KEY,
  completed_at INTEGER NOT NULL,
  store_name TEXT DEFAULT '',
  area TEXT DEFAULT '',
  memo TEXT DEFAULT '',
  lat REAL,
  lng REAL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_deliveries_completed_at
ON deliveries(completed_at DESC);

CREATE TABLE IF NOT EXISTS app_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  payload_json TEXT DEFAULT '{}',
  created_at INTEGER NOT NULL
);
