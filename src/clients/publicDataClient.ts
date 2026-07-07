import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { AppConfig } from "../config.js";
import { distanceMeters } from "../core/distance.js";
import type { Coordinates, SupportFacility } from "../types.js";

interface SupportFacilityRow {
  type: "accessible_restroom" | "wheelchair_charger";
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  opening_hours: string | null;
  phone: string | null;
  source: string;
}

export class PublicDataClient {
  constructor(private readonly config: AppConfig) {}

  findNearbySupportFacilities(
    origin: Coordinates,
    type: "accessible_restroom" | "wheelchair_charger" | "all",
    radiusM: number,
    limit: number
  ): SupportFacility[] {
    if (!Number.isFinite(origin.lat) || !Number.isFinite(origin.lng)) return [];
    if (!fs.existsSync(this.config.dbPath)) return [];
    const db = new DatabaseSync(this.config.dbPath, { readOnly: true });
    try {
      const typeClause = type === "all" ? "" : "WHERE type = ?";
      const stmt = db.prepare(
        `SELECT type, name, address, lat, lng, opening_hours, phone, source FROM support_facilities ${typeClause}`
      );
      const rows = (type === "all" ? stmt.all() : stmt.all(type)) as unknown as SupportFacilityRow[];
      return rows
        .map((row) => ({
          type: row.type,
          name: row.name,
          address: row.address ?? undefined,
          lat: Number(row.lat),
          lng: Number(row.lng),
          opening_hours: row.opening_hours ?? undefined,
          phone: row.phone ?? undefined,
          source: row.source,
          distance_m: distanceMeters(origin, { lat: Number(row.lat), lng: Number(row.lng) })
        }))
        .filter((facility) => facility.distance_m !== undefined && facility.distance_m <= radiusM)
        .sort((a, b) => (a.distance_m ?? 0) - (b.distance_m ?? 0))
        .slice(0, limit);
    } catch {
      return [];
    } finally {
      db.close();
    }
  }

  ensureDatabaseDirectory(): void {
    fs.mkdirSync(path.dirname(this.config.dbPath), { recursive: true });
  }
}
