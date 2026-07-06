import "dotenv/config";
import path from "node:path";

const boolFromEnv = (value: string | undefined, defaultValue: boolean): boolean => {
  if (value === undefined || value === "") {
    return defaultValue;
  }
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
};

const intFromEnv = (value: string | undefined, defaultValue: number): number => {
  if (!value) {
    return defaultValue;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : defaultValue;
};

export interface AppConfig {
  kakaoRestApiKey?: string;
  googleMapsApiKey?: string;
  publicDataServiceKey?: string;
  ktoServiceKey?: string;
  cultureBigdataApiKey?: string;
  useGooglePlaces: boolean;
  useOsm: boolean;
  defaultRadiusM: number;
  defaultLimit: number;
  dbPath: string;
  overpassApiUrl: string;
  httpTimeoutMs: number;
  debug: boolean;
}

export const loadConfig = (): AppConfig => ({
  kakaoRestApiKey: process.env.KAKAO_REST_API_KEY || undefined,
  googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || undefined,
  publicDataServiceKey: process.env.PUBLIC_DATA_SERVICE_KEY || undefined,
  ktoServiceKey: process.env.KTO_SERVICE_KEY || undefined,
  cultureBigdataApiKey: process.env.CULTURE_BIGDATA_API_KEY || undefined,
  useGooglePlaces: boolFromEnv(process.env.USE_GOOGLE_PLACES, true),
  useOsm: boolFromEnv(process.env.USE_OSM, true),
  defaultRadiusM: intFromEnv(process.env.DEFAULT_RADIUS_M, 800),
  defaultLimit: intFromEnv(process.env.DEFAULT_LIMIT, 5),
  dbPath: path.resolve(process.cwd(), process.env.DB_PATH || "./data/accessibility.db"),
  overpassApiUrl: process.env.OVERPASS_API_URL || "https://overpass-api.de/api/interpreter",
  httpTimeoutMs: intFromEnv(process.env.HTTP_TIMEOUT_MS, 8000),
  debug: boolFromEnv(process.env.DEBUG, false)
});
