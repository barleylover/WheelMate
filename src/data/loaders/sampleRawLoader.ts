import fs from "node:fs/promises";
import path from "node:path";
import type { SupportFacility, SupportFacilityType } from "../../core/types.js";
import type { LoaderContext, LoaderResult, PublicDataLoader } from "./types.js";

interface RawSupportFacility {
  type?: SupportFacilityType;
  name?: string;
  facility_name?: string;
  address?: string;
  lat?: number | string;
  lng?: number | string;
  latitude?: number | string;
  longitude?: number | string;
  opening_hours?: string;
  phone?: string;
}

export const createSupportFacilityRawLoader = (params: {
  source: string;
  defaultType: SupportFacilityType;
  fileNames: string[];
}): PublicDataLoader => ({
  source: params.source,
  async load(context: LoaderContext): Promise<LoaderResult> {
    const filePath = await findFirstExisting(context.rawDir, params.fileNames);
    if (!filePath) {
      return {
        source: params.source,
        status: "skipped",
        loadedCount: 0,
        message: `No raw file found. Expected one of: ${params.fileNames.join(", ")}`
      };
    }

    const records = await readRawRows(filePath);
    let loadedCount = 0;
    for (const record of records) {
      const facility = normalizeFacility(record, params.defaultType, params.source);
      if (!facility) {
        continue;
      }
      context.db.insertSupportFacility(facility);
      loadedCount += 1;
    }

    return {
      source: params.source,
      status: "loaded",
      loadedCount,
      message: path.basename(filePath)
    };
  }
});

const findFirstExisting = async (rawDir: string, fileNames: string[]): Promise<string | undefined> => {
  for (const fileName of fileNames) {
    const filePath = path.join(rawDir, fileName);
    try {
      await fs.access(filePath);
      return filePath;
    } catch {
      // continue
    }
  }
  return undefined;
};

const readRawRows = async (filePath: string): Promise<RawSupportFacility[]> => {
  const text = await fs.readFile(filePath, "utf8");
  if (filePath.endsWith(".json")) {
    const parsed = JSON.parse(text) as unknown;
    if (Array.isArray(parsed)) {
      return parsed as RawSupportFacility[];
    }
    if (typeof parsed === "object" && parsed !== null && Array.isArray((parsed as { data?: unknown }).data)) {
      return (parsed as { data: RawSupportFacility[] }).data;
    }
    return [];
  }
  if (filePath.endsWith(".csv")) {
    return parseCsv(text) as RawSupportFacility[];
  }
  return [];
};

const parseCsv = (text: string): Record<string, string>[] => {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const headers = splitCsvLine(lines[0] ?? "");
  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });
};

const splitCsvLine = (line: string): string[] => {
  const values: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current);
  return values.map((value) => value.trim());
};

const normalizeFacility = (
  raw: RawSupportFacility,
  defaultType: SupportFacilityType,
  source: string
): SupportFacility | undefined => {
  const name = raw.name ?? raw.facility_name;
  const lat = raw.lat ?? raw.latitude;
  const lng = raw.lng ?? raw.longitude;
  if (!name || lat === undefined || lng === undefined) {
    return undefined;
  }
  const parsedLat = Number(lat);
  const parsedLng = Number(lng);
  if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLng)) {
    return undefined;
  }
  return {
    type: raw.type ?? defaultType,
    name,
    address: raw.address,
    lat: parsedLat,
    lng: parsedLng,
    openingHours: raw.opening_hours,
    phone: raw.phone,
    source,
    raw
  };
};
