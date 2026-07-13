import { afterEach, describe, expect, it, vi } from "vitest";
import { config } from "../src/config.js";
import { DaumSearchClient } from "../src/clients/daumSearchClient.js";
import { KakaoLocalClient } from "../src/clients/kakaoLocalClient.js";
import { NaverSearchClient } from "../src/clients/naverSearchClient.js";
import type { AppConfig } from "../src/config.js";

function apiConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    ...config,
    kakaoRestApiKey: "kakao-test-key",
    naverClientId: "naver-client-id",
    naverClientSecret: "naver-client-secret",
    useNaverSearch: true,
    useDaumSearch: true,
    useReviewSearch: true,
    searchResultsPerQuery: 5,
    searchTimeoutMs: 1_000,
    ...overrides
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Naver and Daum search API clients", () => {
  it("returns an explicit unavailable result without making a request when Naver credentials are missing", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const client = new NaverSearchClient(apiConfig({ naverClientId: undefined }));

    await expect(client.searchBlog("잠실역 카페 휠체어")).resolves.toMatchObject({
      source: "naver_blog",
      results: [],
      unavailable: true,
      error: "naver_credentials_missing_or_disabled"
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends Naver authentication and normalizes successful HTML-bearing results", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({
      items: [{
        title: "<b>잠실역</b> 접근성 카페",
        link: "https://example.com/naver",
        description: "휠체어 &amp; 전동휠체어 이용 가능",
        bloggername: "접근성기록",
        postdate: "20260713"
      }]
    }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new NaverSearchClient(apiConfig());

    const outcome = await client.searchBlog("잠실역 카페 휠체어", 7, 2, "date");

    expect(outcome).toEqual({
      source: "naver_blog",
      query: "잠실역 카페 휠체어",
      results: [{
        source: "naver_blog",
        title: "잠실역 접근성 카페",
        link: "https://example.com/naver",
        snippet: "휠체어 & 전동휠체어 이용 가능",
        date: "20260713",
        containerName: "접근성기록"
      }]
    });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("/v1/search/blog.json");
    expect(new URL(String(url)).searchParams).toMatchObject(expect.any(URLSearchParams));
    expect(new URL(String(url)).searchParams.get("display")).toBe("7");
    expect(init.headers).toMatchObject({
      "X-Naver-Client-Id": "naver-client-id",
      "X-Naver-Client-Secret": "naver-client-secret"
    });
  });

  it("turns Daum HTTP failures and unsupported source requests into structured unavailable outcomes", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("bad request", { status: 400 }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new DaumSearchClient(apiConfig());

    await expect(client.searchBlog("서면역 음식점 휠체어")).resolves.toMatchObject({
      source: "daum_blog",
      results: [],
      unavailable: true,
      error: "HTTP 400"
    });
    await expect(client.searchSource("naver_blog", "잘못된 제공자")).resolves.toMatchObject({
      unavailable: true,
      error: "unsupported_daum_source"
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("sends Kakao authentication and normalizes successful Daum documents", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({
      documents: [{
        title: "<b>서면역</b> 무장애 식당",
        contents: "출입구에 문턱이 &lt;없음&gt;",
        url: "https://example.com/daum",
        blogname: "부산접근성",
        datetime: "2026-07-13T10:00:00.000+09:00"
      }]
    }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new DaumSearchClient(apiConfig());

    const outcome = await client.searchBlog("서면역 음식점", 4, 3, "recency");

    expect(outcome.results[0]).toMatchObject({
      source: "daum_blog",
      title: "서면역 무장애 식당",
      snippet: "출입구에 문턱이",
      containerName: "부산접근성"
    });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(new URL(String(url)).searchParams.get("size")).toBe("4");
    expect(new URL(String(url)).searchParams.get("page")).toBe("3");
    expect(init.headers).toMatchObject({ Authorization: "KakaoAK kakao-test-key" });
  });
});

describe("Kakao Local API client", () => {
  it("clamps paging parameters, authenticates, and maps place documents", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({
      documents: [{
        id: "place-1",
        place_name: "검증카페",
        category_name: "음식점 > 카페",
        phone: "02-1234-5678",
        address_name: "서울 송파구 잠실동",
        road_address_name: "서울 송파구 올림픽로 1",
        x: "127.1001",
        y: "37.5131",
        distance: "42"
      }]
    }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new KakaoLocalClient(apiConfig());

    const places = await client.keywordSearchPage("잠실역 카페", {
      x: 127.1,
      y: 37.513,
      radius: 1_000,
      size: 99,
      page: 99,
      sort: "distance",
      categoryGroupCode: "CE7"
    });

    expect(places).toEqual([expect.objectContaining({
      id: "place-1",
      sourcePlaceId: "place-1",
      name: "검증카페",
      distance_m: 42,
      source: "kakao_local"
    })]);
    const [url, init] = fetchMock.mock.calls[0]!;
    const params = new URL(String(url)).searchParams;
    expect(params.get("size")).toBe("15");
    expect(params.get("page")).toBe("45");
    expect(params.get("category_group_code")).toBe("CE7");
    expect(init.headers).toMatchObject({ Authorization: "KakaoAK kakao-test-key" });
  });

  it("falls back from a failed category request to keyword search", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("/v2/local/search/category.json")) {
        return new Response("category unavailable", { status: 400 });
      }
      return Response.json({
        documents: [{
          id: "keyword-1",
          place_name: "대체카페",
          category_name: "음식점 > 카페",
          address_name: "서울 송파구",
          x: "127.1002",
          y: "37.5132"
        }]
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const client = new KakaoLocalClient(apiConfig());

    const places = await client.searchNearbyPlaces(
      "잠실역",
      { name: "잠실역", lat: 37.513, lng: 127.1, provider: "test" },
      "cafe",
      1_000,
      5
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(places).toEqual([expect.objectContaining({ name: "대체카페" })]);
    expect(String(fetchMock.mock.calls[1]![0])).toContain("query=%EC%9E%A0%EC%8B%A4%EC%97%AD+%EC%B9%B4%ED%8E%98");
  });

  it("uses address search after an empty keyword result when resolving a location", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ documents: [] }))
      .mockResolvedValueOnce(Response.json({
        documents: [{ address_name: "서울 송파구 잠실동", x: "127.1", y: "37.513" }]
      }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new KakaoLocalClient(apiConfig());

    await expect(client.resolveLocation("잠실역")).resolves.toEqual({
      name: "잠실역",
      lat: 37.513,
      lng: 127.1,
      address: "서울 송파구 잠실동",
      provider: "kakao_local_address"
    });
  });

  it("degrades to a local origin after both Kakao resolution paths fail", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("bad request", { status: 400 }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new KakaoLocalClient(apiConfig());

    await expect(client.resolveLocation("강남역")).resolves.toMatchObject({
      name: "강남역",
      provider: "local_fallback",
      lat: expect.any(Number),
      lng: expect.any(Number)
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
