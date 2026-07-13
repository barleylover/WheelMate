import dotenv from "dotenv";

dotenv.config({ quiet: true });

export interface AppConfig {
  kakaoRestApiKey?: string;
  naverClientId?: string;
  naverClientSecret?: string;
  publicDataServiceKey?: string;
  ktoServiceKey?: string;
  cultureBigdataApiKey?: string;
  useNaverSearch: boolean;
  useDaumSearch: boolean;
  useReviewSearch: boolean;
  useNaverBlog: boolean;
  useNaverCafe: boolean;
  useNaverWeb: boolean;
  useDaumBlog: boolean;
  useDaumCafe: boolean;
  useDaumWeb: boolean;
  defaultRadiusM: number;
  defaultLimit: number;
  maxPlaceCandidates: number;
  maxReviewSearchCalls: number;
  reviewCandidateConcurrency: number;
  maxExternalApiCallsPerRequest: number;
  searchResultsPerQuery: number;
  searchTimeoutMs: number;
  dbPath: string;
}

function optionalEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function boolEnv(name: string, fallback: boolean): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) return fallback;
  return ["1", "true", "yes", "on"].includes(value);
}

function intEnv(name: string, fallback: number, min = 1, max = Number.MAX_SAFE_INTEGER): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

export function loadConfig(): AppConfig {
  return {
    kakaoRestApiKey: optionalEnv("KAKAO_REST_API_KEY"),
    naverClientId: optionalEnv("NAVER_CLIENT_ID"),
    naverClientSecret: optionalEnv("NAVER_CLIENT_SECRET"),
    publicDataServiceKey: optionalEnv("PUBLIC_DATA_SERVICE_KEY"),
    ktoServiceKey: optionalEnv("KTO_SERVICE_KEY"),
    cultureBigdataApiKey: optionalEnv("CULTURE_BIGDATA_API_KEY"),
    useNaverSearch: boolEnv("USE_NAVER_SEARCH", true),
    useDaumSearch: boolEnv("USE_DAUM_SEARCH", true),
    useReviewSearch: boolEnv("USE_REVIEW_SEARCH", true),
    useNaverBlog: boolEnv("USE_NAVER_BLOG", true),
    useNaverCafe: boolEnv("USE_NAVER_CAFE", true),
    useNaverWeb: boolEnv("USE_NAVER_WEB", true),
    useDaumBlog: boolEnv("USE_DAUM_BLOG", true),
    useDaumCafe: boolEnv("USE_DAUM_CAFE", true),
    useDaumWeb: boolEnv("USE_DAUM_WEB", true),
    defaultRadiusM: intEnv("DEFAULT_RADIUS_M", 1000, 50, 20_000),
    defaultLimit: intEnv("DEFAULT_LIMIT", 5, 1, 10),
    maxPlaceCandidates: intEnv("MAX_PLACE_CANDIDATES", 15, 5, 30),
    maxReviewSearchCalls: intEnv("MAX_REVIEW_SEARCH_CALLS", 60, 1, 120),
    reviewCandidateConcurrency: intEnv("REVIEW_CANDIDATE_CONCURRENCY", 2, 1, 4),
    maxExternalApiCallsPerRequest: intEnv("MAX_EXTERNAL_API_CALLS_PER_REQUEST", 40, 8, 120),
    searchResultsPerQuery: intEnv("SEARCH_RESULTS_PER_QUERY", 3, 1, 50),
    searchTimeoutMs: intEnv("SEARCH_TIMEOUT_MS", 3500, 500, 30_000),
    dbPath: optionalEnv("DB_PATH") ?? "./data/accessibility.db"
  };
}

export const config = loadConfig();
