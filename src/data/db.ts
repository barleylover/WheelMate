import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { haversineDistanceM } from "../core/distance.js";
import type { GeoPoint, SupportFacility, SupportFacilityType } from "../core/types.js";
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
}

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
