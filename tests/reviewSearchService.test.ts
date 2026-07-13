import { afterEach, describe, expect, it, vi } from "vitest";
import { config } from "../src/config.js";
import { ReviewSearchService } from "../src/reviewSearch/reviewSearchService.js";
import type { AppConfig } from "../src/config.js";
import type { SourceSearchOutcome } from "../src/types.js";
import { RequestBudget } from "../src/utils/requestBudget.js";

function reviewConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    ...config,
    kakaoRestApiKey: "kakao-test-key",
    naverClientId: "naver-client-id",
    naverClientSecret: "naver-client-secret",
    useReviewSearch: true,
    useNaverSearch: true,
    useDaumSearch: true,
    useNaverBlog: true,
    useNaverCafe: false,
    useNaverWeb: false,
    useDaumBlog: true,
    useDaumCafe: false,
    useDaumWeb: false,
    maxReviewSearchCalls: 10,
    searchTimeoutMs: 1_000,
    ...overrides
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ReviewSearchService API resilience", () => {
  it("keeps a valid Daum recommendation when Naver is unavailable", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      if (String(input).startsWith("https://openapi.naver.com")) {
        return new Response("naver unavailable", { status: 400 });
      }
      return Response.json({
        documents: [{
          title: "잠실역 검증카페 접근성 후기",
          contents: "검증카페 매장 출입구는 휠체어 이용 가능",
          url: "https://example.com/verified-daum",
          blogname: "접근성기록",
          datetime: "2026-07-13T10:00:00.000+09:00"
        }]
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const service = new ReviewSearchService(reviewConfig());

    const analysis = await service.analyzePlace({
      name: "검증카페",
      category: "카페",
      address: "서울 송파구 잠실동",
      lat: 37.513,
      lng: 127.1
    }, "잠실역", [], 1);

    expect(analysis.review_signal_grade).toBe("R1");
    expect(analysis.results).toEqual([
      expect.objectContaining({
        source: "daum_blog",
        link: "https://example.com/verified-daum",
        attribution_verified: true,
        place_name_match: "exact",
        place_location_match: true
      })
    ]);
    expect(analysis.unavailable_sources).toEqual({ naver_blog: "HTTP 400" });
    expect(analysis.source_counts).toMatchObject({ naver_blog: 0, daum_blog: 1 });
    expect(analysis.attribution).toEqual([
      "Naver Search API 결과 기반 참고 신호",
      "Daum Search API 결과 기반 참고 신호"
    ]);
  });

  it("isolates an unexpected provider rejection and preserves the other provider outcome", async () => {
    const service = new ReviewSearchService(reviewConfig());
    const internals = service as unknown as {
      naver: { searchSource: (source: string, query: string) => Promise<SourceSearchOutcome> };
      daum: { searchSource: (source: string, query: string) => Promise<SourceSearchOutcome> };
    };
    vi.spyOn(internals.naver, "searchSource").mockRejectedValue(new Error("provider exploded"));
    vi.spyOn(internals.daum, "searchSource").mockResolvedValue({
      source: "daum_blog",
      query: "접근성 질의",
      results: []
    });

    await expect(service.searchQueries(["접근성 질의"], 2)).resolves.toEqual([
      {
        source: "naver_blog",
        query: "접근성 질의",
        results: [],
        unavailable: true,
        error: "search_call_rejected"
      },
      { source: "daum_blog", query: "접근성 질의", results: [] }
    ]);
  });

  it("reserves retry capacity and never schedules more logical calls than the request budget", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ items: [] }));
    vi.stubGlobal("fetch", fetchMock);
    const budget = new RequestBudget(1);
    const service = new ReviewSearchService(reviewConfig(), budget);

    const outcomes = await service.searchQueries(["첫 질의", "두 번째 질의"], 10);

    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]?.source).toBe("naver_blog");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(service.budgetSnapshot()).toEqual({ limit: 1, used: 1, remaining: 0, exhausted: true });
  });

  it("returns an R4 analysis with explicit provider diagnostics when credentials are missing", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const service = new ReviewSearchService(reviewConfig({
      kakaoRestApiKey: undefined,
      naverClientId: undefined,
      naverClientSecret: undefined
    }));

    const analysis = await service.searchPlaceAccessibilityReviews({
      place_name: "검증카페",
      neighborhood: "잠실역",
      category: "카페",
      limit: 99
    });

    expect(analysis).toMatchObject({
      review_signal_grade: "R4",
      review_signal_score: 0,
      results: [],
      unavailable_sources: {
        naver_blog: "naver_credentials_missing_or_disabled",
        daum_blog: "kakao_credentials_missing_or_daum_disabled"
      }
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
