import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { AppConfig } from "../config.js";
import { addressAreaScore, parseAddressArea } from "../core/addressArea.js";
import { distanceMeters } from "../core/distance.js";
import { compactPlaceName } from "../core/placeMatcher.js";
import { normalizeText } from "../core/normalize.js";
import type { Coordinates, PlaceCandidate, PublicSupportEvidence, SupportFacility } from "../types.js";

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

interface SupportFacilityAddressRow {
  type: "accessible_restroom" | "wheelchair_charger";
  name: string;
  address: string;
  region1: string | null;
  region2: string | null;
  region3: string | null;
  opening_hours: string | null;
  phone: string | null;
  source: string;
}

interface PublicAccessibilityEvidenceRow {
  source: string;
  source_family: string;
  evidence_level: string;
  evidence_type: string;
  value: string | null;
  detail: string | null;
  confidence: number | null;
  name: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
}

function sameAddressArea(placeAddress: string | undefined, evidenceAddress: string | null): boolean {
  const place = normalizeText(placeAddress ?? "");
  const evidence = normalizeText(evidenceAddress ?? "");
  if (!place || !evidence) return false;
  if (place === evidence || place.includes(evidence) || evidence.includes(place)) return true;
  const placeTokens = place.split(/\s+/).slice(0, 4).join(" ");
  const evidenceTokens = evidence.split(/\s+/).slice(0, 4).join(" ");
  return Boolean(placeTokens && evidenceTokens && placeTokens === evidenceTokens);
}

function sameOrNestedName(placeName: string, evidenceName: string | null): boolean {
  const place = compactPlaceName(placeName);
  const evidence = compactPlaceName(evidenceName ?? "");
  return Boolean(place && evidence && (place.includes(evidence) || evidence.includes(place)));
}

function toPublicSupportEvidence(
  row: PublicAccessibilityEvidenceRow,
  distanceM?: number
): PublicSupportEvidence | null {
  const sourceFamily = row.source_family as PublicSupportEvidence["source_family"];
  const level = row.evidence_level as PublicSupportEvidence["level"];
  const evidenceType = row.evidence_type as PublicSupportEvidence["evidence_type"];
  if (!["bf_certification", "disability_facility", "support_facility", "culture_fallback"].includes(sourceFamily)) {
    return null;
  }
  if (!["building_or_facility_level", "nearby_support_only", "unverified"].includes(level)) {
    return null;
  }
  if (
    ![
      "bf_certified",
      "disability_facility",
      "barrier_free_travel",
      "culture_barrier_free",
      "museum_accessibility",
      "accessible_restroom_nearby",
      "wheelchair_charger_nearby"
    ].includes(evidenceType)
  ) {
    return null;
  }
  return {
    source: row.source,
    source_family: sourceFamily,
    level,
    evidence_type: evidenceType,
    detail: row.detail ?? row.value ?? `${row.source} 접근성 근거`,
    confidence: Number(row.confidence ?? 0.7),
    distance_m: distanceM
  };
}

export class PublicDataClient {
  constructor(private readonly config: AppConfig) {}

  findNearbySupportFacilities(
    origin: Coordinates,
    type: "accessible_restroom" | "wheelchair_charger" | "all",
    radiusM: number,
    limit: number,
    originAddress?: string
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
      const coordinateFacilities = rows
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
      const addressFacilities = this.findAddressMatchedSupportFacilities(db, originAddress, type, limit);
      return dedupeSupportFacilities([...coordinateFacilities, ...addressFacilities]);
    } catch {
      return [];
    } finally {
      db.close();
    }
  }

  private findAddressMatchedSupportFacilities(
    db: DatabaseSync,
    originAddress: string | undefined,
    type: "accessible_restroom" | "wheelchair_charger" | "all",
    limit: number
  ): SupportFacility[] {
    if (!originAddress || type === "wheelchair_charger") return [];
    const area = parseAddressArea(originAddress);
    if (!area.region1 || !area.region2) return [];
    const typeClause = type === "all" ? "type = 'accessible_restroom'" : "type = ?";
    const params = type === "all"
      ? [area.region1, area.region2]
      : [type, area.region1, area.region2];
    const rows = db
      .prepare(
        `SELECT type, name, address, region1, region2, region3, opening_hours, phone, source
           FROM support_facility_address_records
          WHERE ${typeClause}
            AND region1 = ?
            AND region2 = ?`
      )
      .all(...params) as unknown as SupportFacilityAddressRow[];
    return rows
      .map((row) => ({
        row,
        score: addressAreaScore(originAddress, row.address)
      }))
      .filter((item) => item.score >= 65)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ row }) => ({
        type: row.type,
        name: row.name,
        address: row.address,
        opening_hours: row.opening_hours ?? undefined,
        phone: row.phone ?? undefined,
        source: row.source
      }));
  }

  findMatchingAccessibilityEvidence(
    place: PlaceCandidate,
    radiusM = 80,
    limit = 5
  ): PublicSupportEvidence[] {
    if (!fs.existsSync(this.config.dbPath)) return [];
    const db = new DatabaseSync(this.config.dbPath, { readOnly: true });
    try {
      const rows = db
        .prepare(
          `SELECT source, source_family, evidence_level, evidence_type, value, detail, confidence,
                  name, address, lat, lng
             FROM public_accessibility_evidence`
        )
        .all() as unknown as PublicAccessibilityEvidenceRow[];
      return rows
        .map((row) => {
          const hasCoordinates =
            Number.isFinite(Number(row.lat)) &&
            Number.isFinite(Number(row.lng)) &&
            Number.isFinite(place.lat) &&
            Number.isFinite(place.lng);
          const distanceM =
            hasCoordinates && row.lat !== null && row.lng !== null
              ? distanceMeters(place, { lat: Number(row.lat), lng: Number(row.lng) })
              : undefined;
          const coordinateMatch = distanceM !== undefined && distanceM <= radiusM;
          const nameMatch = sameOrNestedName(place.name, row.name);
          const addressMatch = sameAddressArea(place.roadAddress ?? place.address, row.address);
          if (!coordinateMatch && !(nameMatch && addressMatch) && !(nameMatch && !row.address)) {
            return null;
          }
          return toPublicSupportEvidence(row, distanceM);
        })
        .filter((item): item is PublicSupportEvidence => item !== null)
        .sort((a, b) => {
          const distanceDiff = (a.distance_m ?? Number.POSITIVE_INFINITY) - (b.distance_m ?? Number.POSITIVE_INFINITY);
          if (distanceDiff !== 0) return distanceDiff;
          return b.confidence - a.confidence;
        })
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

function dedupeSupportFacilities(facilities: SupportFacility[]): SupportFacility[] {
  const seen = new Set<string>();
  const deduped: SupportFacility[] = [];
  for (const facility of facilities) {
    const key = `${facility.type}:${normalizeText(facility.name)}:${normalizeText(facility.address ?? "")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(facility);
  }
  return deduped;
}
