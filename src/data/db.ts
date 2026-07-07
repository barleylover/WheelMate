import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { haversineDistanceM } from "../core/distance.js";
import type {
  BuildingAccessibility,
  GeoPoint,
  SupportFacility,
  SupportFacilityType
} from "../core/types.js";
import { logger } from "../utils/logger.js";

interface StatementLike {
  all(...params: unknown[]): unknown[];
  get(...params: unknown[]): unknown;
  run(...params: unknown[]): unknown;
}

interface DatabaseLike {
  exec(sql: string): void;
  prepare(sql: string): StatementLike;
  close(): void;
}

interface SqliteModule {
  DatabaseSync: new (filename: string) => DatabaseLike;
}

export class WheelMateDatabase {
  private db?: DatabaseLike;

  constructor(private readonly dbPath: string) {}

  init(): boolean {
    try {
      const require = createRequire(import.meta.url);
      const sqlite = require("node:sqlite") as SqliteModule;
      fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });
      this.db = new sqlite.DatabaseSync(this.dbPath);
      const schema = fs.readFileSync(new URL("./schema.sql", import.meta.url), "utf8");
      this.db.exec(schema);
      return true;
    } catch (error) {
      logger.warn("SQLite is unavailable; continuing without local public-data DB", {
        reason: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }

  close(): void {
    this.db?.close();
  }

  querySupportFacilities(
    origin: GeoPoint,
    radiusM: number,
    type: SupportFacilityType | "all" = "all",
    limit = 10
  ): SupportFacility[] {
    if (!this.db) {
      return [];
    }
    const rows =
      type === "all"
        ? this.db.prepare("SELECT * FROM support_facilities").all()
        : this.db.prepare("SELECT * FROM support_facilities WHERE type = ?").all(type);

    return rows
      .map((row) => normalizeSupportFacility(row as Record<string, unknown>))
      .map((facility) => ({ ...facility, distanceM: haversineDistanceM(origin, facility) }))
      .filter((facility) => facility.distanceM !== undefined && facility.distanceM <= radiusM)
      .sort((a, b) => a.distanceM! - b.distanceM!)
      .slice(0, limit);
  }

  insertSupportFacility(facility: SupportFacility): void {
    if (!this.db) {
      return;
    }
    this.db
      .prepare(
        `INSERT INTO support_facilities
          (type, name, address, lat, lng, opening_hours, phone, source, raw_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        facility.type,
        facility.name,
        facility.address ?? null,
        facility.lat,
        facility.lng,
        facility.openingHours ?? null,
        facility.phone ?? null,
        facility.source,
        facility.raw ? JSON.stringify(facility.raw) : null
      );
  }

  queryBuildingAccessibilityNear(
    origin: GeoPoint,
    radiusM: number,
    limit = 100
  ): BuildingAccessibility[] {
    if (!this.db) {
      return [];
    }
    // 전국 데이터가 커도 바운딩 박스(위/경도 인덱스)로 먼저 좁힌 뒤 haversine 으로 정밀 필터한다.
    const latDelta = radiusM / 111320;
    const lngDelta = radiusM / (111320 * Math.max(Math.cos((origin.lat * Math.PI) / 180), 0.01));
    const rows = this.db
      .prepare(
        "SELECT * FROM building_accessibility WHERE lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?"
      )
      .all(origin.lat - latDelta, origin.lat + latDelta, origin.lng - lngDelta, origin.lng + lngDelta);
    return rows
      .map((row) => normalizeBuildingAccessibility(row as Record<string, unknown>))
      .map((record) => ({ ...record, distanceM: haversineDistanceM(origin, record) }))
      .filter((record) => record.distanceM !== undefined && record.distanceM <= radiusM)
      .sort((a, b) => a.distanceM! - b.distanceM!)
      .slice(0, limit);
  }

  insertBuildingAccessibility(record: BuildingAccessibility): void {
    if (!this.db) {
      return;
    }
    this.db
      .prepare(
        `INSERT INTO building_accessibility
          (name, address, road_address, lat, lng, bf_certified, has_elevator,
           has_accessible_restroom, has_threshold_removed, has_entrance_ramp,
           has_accessible_parking, source, raw_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        record.name,
        record.address ?? null,
        record.roadAddress ?? null,
        record.lat,
        record.lng,
        record.bfCertified ? 1 : 0,
        record.hasElevator ? 1 : 0,
        record.hasAccessibleRestroom ? 1 : 0,
        record.hasThresholdRemoved ? 1 : 0,
        record.hasEntranceRamp ? 1 : 0,
        record.hasAccessibleParking ? 1 : 0,
        record.source,
        record.raw ? JSON.stringify(record.raw) : null
      );
  }

  getCachedJson<T>(key: string): T | undefined {
    if (!this.db) {
      return undefined;
    }
    const row = this.db
      .prepare("SELECT response_json, expires_at FROM api_cache WHERE cache_key = ?")
      .get(key) as { response_json?: string; expires_at?: string } | undefined;
    if (!row?.response_json || !row.expires_at) {
      return undefined;
    }
    if (new Date(row.expires_at).getTime() < Date.now()) {
      return undefined;
    }
    try {
      return JSON.parse(row.response_json) as T;
    } catch {
      return undefined;
    }
  }

  putCachedJson(key: string, provider: string, value: unknown, ttlMs: number): void {
    if (!this.db) {
      return;
    }
    const expiresAt = new Date(Date.now() + ttlMs).toISOString();
    this.db
      .prepare(
        `INSERT INTO api_cache (cache_key, provider, response_json, expires_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(cache_key) DO UPDATE SET
           provider = excluded.provider,
           response_json = excluded.response_json,
           expires_at = excluded.expires_at`
      )
      .run(key, provider, JSON.stringify(value), expiresAt);
  }
}

const normalizeBuildingAccessibility = (row: Record<string, unknown>): BuildingAccessibility => ({
  name: String(row.name),
  address: row.address ? String(row.address) : undefined,
  roadAddress: row.road_address ? String(row.road_address) : undefined,
  lat: Number(row.lat),
  lng: Number(row.lng),
  bfCertified: Number(row.bf_certified) === 1,
  hasElevator: Number(row.has_elevator) === 1,
  hasAccessibleRestroom: Number(row.has_accessible_restroom) === 1,
  hasThresholdRemoved: Number(row.has_threshold_removed) === 1,
  hasEntranceRamp: Number(row.has_entrance_ramp) === 1,
  hasAccessibleParking: Number(row.has_accessible_parking) === 1,
  source: String(row.source),
  raw: row.raw_json ? JSON.parse(String(row.raw_json)) : undefined
});

const normalizeSupportFacility = (row: Record<string, unknown>): SupportFacility => ({
  type: row.type as SupportFacilityType,
  name: String(row.name),
  address: row.address ? String(row.address) : undefined,
  lat: Number(row.lat),
  lng: Number(row.lng),
  openingHours: row.opening_hours ? String(row.opening_hours) : undefined,
  phone: row.phone ? String(row.phone) : undefined,
  source: String(row.source),
  raw: row.raw_json ? JSON.parse(String(row.raw_json)) : undefined
});
