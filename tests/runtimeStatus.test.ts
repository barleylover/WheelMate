import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppConfig } from "../src/config.js";
import { runtimeStatus } from "../src/runtimeStatus.js";

const baseConfig: AppConfig = {
  kakaoRestApiKey: "kakao-secret",
  naverClientId: "naver-id-secret",
  naverClientSecret: "naver-secret",
  publicDataServiceKey: undefined,
  ktoServiceKey: undefined,
  cultureBigdataApiKey: undefined,
  useNaverSearch: true,
  useDaumSearch: true,
  useReviewSearch: true,
  useNaverBlog: true,
  useNaverCafe: true,
  useNaverWeb: true,
  useDaumBlog: true,
  useDaumCafe: true,
  useDaumWeb: true,
  defaultRadiusM: 1000,
  defaultLimit: 5,
  maxPlaceCandidates: 5,
  maxReviewSearchCalls: 60,
  maxExternalApiCallsPerRequest: 40,
  searchResultsPerQuery: 3,
  searchTimeoutMs: 3500,
  dbPath: "./data/accessibility.db"
};

describe("runtimeStatus", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("exposes build and credential status without leaking secret values", () => {
    vi.stubEnv("WHEELMATE_BUILD_SHA", "abcdef1234567890");
    vi.stubEnv("WHEELMATE_BUILD_REF", "feat/review-search-mcp");

    const status = runtimeStatus(baseConfig);
    const text = JSON.stringify(status);

    expect(status).toMatchObject({
      build: {
        sha: "abcdef1234567890",
        short_sha: "abcdef123456",
        ref: "feat/review-search-mcp",
        expected_sha_tag: "sha-abcdef1"
      },
      credentials: {
        kakao_rest_api_key_configured: true,
        naver_client_id_configured: true,
        naver_client_secret_configured: true
      }
    });
    expect(text).not.toContain("kakao-secret");
    expect(text).not.toContain("naver-id-secret");
    expect(text).not.toContain("naver-secret");
  });

  it("reports missing required search credentials as warnings", () => {
    const status = runtimeStatus({
      ...baseConfig,
      kakaoRestApiKey: undefined,
      naverClientId: undefined,
      naverClientSecret: undefined
    });

    expect(status).toMatchObject({
      credentials: {
        kakao_rest_api_key_configured: false,
        naver_client_id_configured: false,
        naver_client_secret_configured: false
      },
      warnings: expect.arrayContaining([
        "KAKAO_REST_API_KEY is missing",
        "NAVER_CLIENT_ID is missing",
        "NAVER_CLIENT_SECRET is missing"
      ])
    });
  });
});
