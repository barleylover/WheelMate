import fs from "node:fs";
import path from "node:path";
import { TextDecoder } from "node:util";
import { DatabaseSync } from "node:sqlite";
import { config } from "../../config.js";
import { applySchema, openDatabase } from "../db.js";

type EvidenceSourceFamily =
  | "bf_certification"
  | "disability_facility"
  | "support_facility"
  | "culture_fallback";

type EvidenceType =
  | "bf_certified"
  | "disability_facility"
  | "barrier_free_travel"
  | "culture_barrier_free"
  | "museum_accessibility";

interface PublicEvidenceCsvOptions {
  filename: string;
  source: string;
  sourceFamily: EvidenceSourceFamily;
  evidenceType: EvidenceType;
  nameFields: string[];
  addressFields: string[];
  latFields?: string[];
  lngFields?: string[];
  detailFields?: string[];
  defaultDetail: string;
}

interface SupportFacilityCsvOptions {
  filename: string;
  type: "accessible_restroom" | "wheelchair_charger";
  source: string;
  nameFields: string[];
  addressFields: string[];
  latFields: string[];
  lngFields: string[];
  openingHourFields?: string[];
  phoneFields?: string[];
}

function importPath(filename: string): string {
  return path.join(process.cwd(), "data", "import", filename);
}

function replacementCount(text: string): number {
  return text.split("\uFFFD").length - 1;
}

export function decodeCsvBuffer(buffer: Buffer): string {
  const utf8 = new TextDecoder("utf-8").decode(buffer);
  const utf8BadCount = replacementCount(utf8.slice(0, 4096));
  if (utf8BadCount === 0) return utf8;

  const eucKr = new TextDecoder("euc-kr").decode(buffer);
  const eucKrBadCount = replacementCount(eucKr.slice(0, 4096));
  return eucKrBadCount < utf8BadCount ? eucKr : utf8;
}

function parseCsv(text: string): Array<Record<string, string>> {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (quoted) {
      if (char === "\"" && next === "\"") {
        field += "\"";
        i += 1;
      } else if (char === "\"") {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === "\"") {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }
  if (field || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  const [headers = [], ...records] = rows;
  const normalizedHeaders = headers.map((header) => header.trim().replace(/^\uFEFF/, ""));
  return records
    .filter((record) => record.some((value) => value.trim()))
    .map((record) =>
      Object.fromEntries(normalizedHeaders.map((header, index) => [header, record[index]?.trim() ?? ""]))
    );
}

function readCsv(filename: string): Array<Record<string, string>> {
  const file = importPath(filename);
  if (!fs.existsSync(file)) return [];
  return parseCsv(decodeCsvBuffer(fs.readFileSync(file)));
}

function pick(row: Record<string, string>, fields: string[] = []): string | undefined {
  for (const field of fields) {
    const value = row[field]?.trim();
    if (value) return value;
  }
  return undefined;
}

function numberValue(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function withDatabase<T>(fn: (db: DatabaseSync) => T): T {
  const db = openDatabase(config);
  try {
    applySchema(db);
    return fn(db);
  } finally {
    db.close();
  }
}

export function loadPublicEvidenceCsv(options: PublicEvidenceCsvOptions): number {
  const rows = readCsv(options.filename);
  if (rows.length === 0) return 0;
  return withDatabase((db) => {
    db.prepare("DELETE FROM public_accessibility_evidence WHERE source = ?").run(options.source);
    const stmt = db.prepare(
      `INSERT INTO public_accessibility_evidence
        (name, address, lat, lng, source, source_family, evidence_level, evidence_type, value, detail, confidence, raw_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    let count = 0;
    for (const row of rows) {
      const name = pick(row, options.nameFields);
      if (!name) continue;
      const address = pick(row, options.addressFields);
      const lat = numberValue(pick(row, options.latFields));
      const lng = numberValue(pick(row, options.lngFields));
      const detail = pick(row, options.detailFields) ?? options.defaultDetail;
      stmt.run(
        name,
        address ?? null,
        lat,
        lng,
        options.source,
        options.sourceFamily,
        "building_or_facility_level",
        options.evidenceType,
        detail,
        `${options.source}: ${detail}`,
        0.78,
        JSON.stringify(row)
      );
      count += 1;
    }
    return count;
  });
}

export function loadSupportFacilityCsv(options: SupportFacilityCsvOptions): number {
  const rows = readCsv(options.filename);
  if (rows.length === 0) return 0;
  return withDatabase((db) => {
    db.prepare("DELETE FROM support_facilities WHERE type = ? AND source = ?").run(options.type, options.source);
    const stmt = db.prepare(
      `INSERT INTO support_facilities
        (type, name, address, lat, lng, opening_hours, phone, source, raw_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    let count = 0;
    for (const row of rows) {
      const name = pick(row, options.nameFields);
      const lat = numberValue(pick(row, options.latFields));
      const lng = numberValue(pick(row, options.lngFields));
      if (!name || lat === null || lng === null) continue;
      stmt.run(
        options.type,
        name,
        pick(row, options.addressFields) ?? null,
        lat,
        lng,
        pick(row, options.openingHourFields) ?? null,
        pick(row, options.phoneFields) ?? null,
        options.source,
        JSON.stringify(row)
      );
      count += 1;
    }
    return count;
  });
}
