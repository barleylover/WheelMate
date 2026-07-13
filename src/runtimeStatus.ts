import type { AppConfig } from "./config.js";
import { enabledSearchSources } from "./reviewSearch/sourceRouter.js";

function configured(value: string | undefined): boolean {
  return Boolean(value?.trim());
}

function firstEnv(names: string[]): string {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return "unknown";
}

function shortSha(value: string): string {
  if (value === "unknown") return value;
  return value.slice(0, 12);
}

export function runtimeStatus(config: AppConfig): Record<string, unknown> {
  const buildSha = firstEnv(["WHEELMATE_BUILD_SHA", "GITHUB_SHA", "SOURCE_COMMIT", "IMAGE_SHA"]);
  const buildRef = firstEnv(["WHEELMATE_BUILD_REF", "GITHUB_REF_NAME"]);
  const credentialStatus = {
    kakao_rest_api_key_configured: configured(config.kakaoRestApiKey),
    naver_client_id_configured: configured(config.naverClientId),
    naver_client_secret_configured: configured(config.naverClientSecret),
    public_data_service_key_configured: configured(config.publicDataServiceKey),
    kto_service_key_configured: configured(config.ktoServiceKey),
    culture_bigdata_api_key_configured: configured(config.cultureBigdataApiKey)
  };
  const enabledSources = enabledSearchSources(config);
  const warnings: string[] = [];
  if (!credentialStatus.kakao_rest_api_key_configured) warnings.push("KAKAO_REST_API_KEY is missing");
  if (!credentialStatus.naver_client_id_configured) warnings.push("NAVER_CLIENT_ID is missing");
  if (!credentialStatus.naver_client_secret_configured) warnings.push("NAVER_CLIENT_SECRET is missing");
  if (enabledSources.length === 0) warnings.push("No review search source is enabled");

  return {
    service: "WheelMate Review Search MCP",
    status: "ok",
    access: {
      authentication: "none"
    },
    build: {
      sha: buildSha,
      short_sha: shortSha(buildSha),
      ref: buildRef,
      expected_sha_tag: buildSha === "unknown" ? "unknown" : `sha-${buildSha.slice(0, 7)}`
    },
    credentials: credentialStatus,
    search: {
      use_review_search: config.useReviewSearch,
      use_naver_search: config.useNaverSearch,
      use_daum_search: config.useDaumSearch,
      enabled_sources: enabledSources,
      max_review_search_calls: config.maxReviewSearchCalls,
      review_candidate_concurrency: config.reviewCandidateConcurrency,
      max_external_api_calls_per_request: config.maxExternalApiCallsPerRequest,
      search_results_per_query: config.searchResultsPerQuery
    },
    place_search: {
      default_radius_m: config.defaultRadiusM,
      default_limit: config.defaultLimit,
      max_place_candidates: config.maxPlaceCandidates
    },
    data: {
      db_path: config.dbPath
    },
    warnings
  };
}
