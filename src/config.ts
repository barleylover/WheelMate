import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

// MCP 클라이언트가 임의의 cwd 에서 서버를 띄워도 동작하도록, .env 와 DB 상대경로를
// 프로젝트 루트(이 모듈의 상위 폴더) 기준으로 고정한다. dev(src/)·prod(dist/) 모두 상위가 루트.
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// quiet: dotenv v17 의 "injected env" 안내가 stdout 에 찍히면 MCP stdio JSON-RPC 스트림이 깨진다.
dotenv.config({ path: path.join(projectRoot, ".env"), quiet: true });

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
  googleFallbackOnly: boolean;
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
  googleFallbackOnly: boolFromEnv(process.env.GOOGLE_FALLBACK_ONLY, true),
  useOsm: boolFromEnv(process.env.USE_OSM, true),
  defaultRadiusM: intFromEnv(process.env.DEFAULT_RADIUS_M, 1000),
  defaultLimit: intFromEnv(process.env.DEFAULT_LIMIT, 3),
  dbPath: path.resolve(projectRoot, process.env.DB_PATH || "./data/accessibility.db"),
  overpassApiUrl: process.env.OVERPASS_API_URL || "https://overpass-api.de/api/interpreter",
  httpTimeoutMs: intFromEnv(process.env.HTTP_TIMEOUT_MS, 8000),
  debug: boolFromEnv(process.env.DEBUG, false)
});
