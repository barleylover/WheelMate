CREATE TABLE IF NOT EXISTS places (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT,
  address TEXT,
  road_address TEXT,
  lat REAL,
  lng REAL,
  phone TEXT,
  source TEXT,
  source_place_id TEXT,
  raw_json TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public_accessibility_evidence (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  place_id INTEGER,
  name TEXT,
  address TEXT,
  lat REAL,
  lng REAL,
  source TEXT NOT NULL,
  source_family TEXT NOT NULL,
  evidence_level TEXT NOT NULL,
  evidence_type TEXT NOT NULL,
  value TEXT,
  detail TEXT,
  confidence REAL,
  raw_json TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(place_id) REFERENCES places(id)
);

CREATE TABLE IF NOT EXISTS support_facilities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK(type IN ('accessible_restroom', 'wheelchair_charger')),
  name TEXT NOT NULL,
  address TEXT,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  opening_hours TEXT,
  phone TEXT,
  source TEXT NOT NULL,
  raw_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_support_facilities_type ON support_facilities(type);
CREATE INDEX IF NOT EXISTS idx_support_facilities_lat_lng ON support_facilities(lat, lng);

CREATE TABLE IF NOT EXISTS support_facility_address_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK(type IN ('accessible_restroom', 'wheelchair_charger')),
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  region1 TEXT,
  region2 TEXT,
  region3 TEXT,
  opening_hours TEXT,
  phone TEXT,
  source TEXT NOT NULL,
  raw_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_support_facility_address_type ON support_facility_address_records(type);
CREATE INDEX IF NOT EXISTS idx_support_facility_address_area ON support_facility_address_records(region1, region2, region3);

CREATE TABLE IF NOT EXISTS geocode_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  query TEXT NOT NULL UNIQUE,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  address TEXT,
  provider TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS api_health_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL,
  status TEXT NOT NULL,
  error_message TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
