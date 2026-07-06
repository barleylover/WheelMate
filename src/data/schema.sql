CREATE TABLE IF NOT EXISTS places (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT,
  address TEXT,
  road_address TEXT,
  lat REAL,
  lng REAL,
  phone TEXT,
  source TEXT NOT NULL,
  source_place_id TEXT,
  raw_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS accessibility_evidence (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  place_id INTEGER,
  source TEXT NOT NULL,
  evidence_level TEXT NOT NULL CHECK (
    evidence_level IN (
      'store_level',
      'building_or_facility_level',
      'nearby_support_only',
      'unverified'
    )
  ),
  evidence_type TEXT NOT NULL CHECK (
    evidence_type IN (
      'wheelchair_entrance',
      'wheelchair_seating',
      'wheelchair_restroom',
      'wheelchair_parking',
      'osm_wheelchair',
      'bf_certified',
      'disability_facility',
      'entrance_ramp',
      'threshold_removed',
      'elevator',
      'building_accessible_restroom',
      'accessible_restroom_nearby',
      'wheelchair_charger_nearby',
      'provider_unavailable'
    )
  ),
  value TEXT,
  detail TEXT,
  confidence REAL,
  raw_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (place_id) REFERENCES places(id)
);

CREATE TABLE IF NOT EXISTS support_facilities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK (type IN ('accessible_restroom', 'wheelchair_charger')),
  name TEXT NOT NULL,
  address TEXT,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  opening_hours TEXT,
  phone TEXT,
  source TEXT NOT NULL,
  raw_json TEXT
);

CREATE TABLE IF NOT EXISTS api_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cache_key TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL,
  response_json TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS geocode_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  query TEXT NOT NULL UNIQUE,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  address TEXT,
  provider TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_places_source_place_id ON places(source, source_place_id);
CREATE INDEX IF NOT EXISTS idx_places_lat_lng ON places(lat, lng);
CREATE INDEX IF NOT EXISTS idx_support_facilities_type ON support_facilities(type);
CREATE INDEX IF NOT EXISTS idx_api_cache_key ON api_cache(cache_key);
CREATE INDEX IF NOT EXISTS idx_geocode_cache_query ON geocode_cache(query);
