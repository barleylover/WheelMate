import { describe, expect, it } from "vitest";
import { configFromAuthorization, createPlayMcpConfigToken } from "../src/auth/playMcpConfigToken.js";
import type { AppConfig } from "../src/config.js";

const baseConfig: AppConfig = {
  useNaverSearch: true,
  useDaumSearch: true,
  useReviewSearch: true,
  useNaverBlog: true,
  useNaverCafe: true,
  useNaverWeb: true,
  useDaumBlog: true,
  useDaumCafe: true,
  useDaumWeb: true,
  defaultRadiusM: 800,
  defaultLimit: 5,
  maxPlaceCandidates: 5,
  maxReviewSearchCalls: 60,
  searchResultsPerQuery: 3,
  searchTimeoutMs: 3500,
  dbPath: "./data/accessibility.db"
};

describe("PlayMCP config token", () => {
  it("creates and reads API config from a bearer token", () => {
    const token = createPlayMcpConfigToken({
      KAKAO_REST_API_KEY: "kakao-test",
      NAVER_CLIENT_ID: "naver-id",
      NAVER_CLIENT_SECRET: "naver-secret",
      PUBLIC_DATA_SERVICE_KEY: "public-data-key",
      KTO_SERVICE_KEY: "kto-key",
      CULTURE_BIGDATA_API_KEY: "culture-key"
    } as NodeJS.ProcessEnv);

    const config = configFromAuthorization(baseConfig, `Bearer ${token}`);

    expect(config.kakaoRestApiKey).toBe("kakao-test");
    expect(config.naverClientId).toBe("naver-id");
    expect(config.naverClientSecret).toBe("naver-secret");
    expect(config.publicDataServiceKey).toBe("public-data-key");
    expect(config.ktoServiceKey).toBe("kto-key");
    expect(config.cultureBigdataApiKey).toBe("culture-key");
  });

  it("falls back to base config for missing or invalid token", () => {
    expect(configFromAuthorization(baseConfig, undefined)).toBe(baseConfig);
    expect(configFromAuthorization(baseConfig, "Bearer invalid")).toBe(baseConfig);
  });
});
