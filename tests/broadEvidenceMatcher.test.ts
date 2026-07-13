import { describe, expect, it } from "vitest";
import {
  attachBroadAccessibilityEvidence,
  buildBroadEvidenceQueries,
  type SearchQueryRunner
} from "../src/search/broadEvidenceMatcher.js";
import type { PlaceSearchProvider } from "../src/search/candidateSearch.js";
import { resolveSearchIntent } from "../src/search/intentResolver.js";
import type { NormalizedSearchResult, PlaceCandidate, SourceSearchOutcome } from "../src/types.js";

function result(title: string, snippet: string, link: string): NormalizedSearchResult {
  return { source: "naver_blog", title, snippet, link, date: "20260701" };
}

function placeProvider(keywordResults: PlaceCandidate[] = []): PlaceSearchProvider {
  return {
    searchNearbyPlaces: async () => [],
    categorySearch: async () => [],
    keywordSearchPage: async () => keywordResults
  };
}

describe("broad evidence matcher", () => {
  it("builds accessibility-focused queries from normalized intent", () => {
    const intent = resolveSearchIntent({ query: "제주도 횟집 휠체어" }, { defaultRadiusM: 1000, defaultLimit: 5 });
    expect(buildBroadEvidenceQueries(intent).slice(0, 2)).toEqual([
      "제주도 횟집 휠체어 출입",
      "제주도 횟집 장애인 편의시설"
    ]);
  });

  it("attaches evidence only to a known place with venue-level accessibility", async () => {
    const intent = resolveSearchIntent({ location: "잠실역", category: "cafe" }, { defaultRadiusM: 1000, defaultLimit: 5 });
    const candidates: PlaceCandidate[] = [
      { sourcePlaceId: "1", name: "A카페", category: "카페", address: "서울 송파구", lat: 37.5, lng: 127.1 },
      { sourcePlaceId: "2", name: "B카페", category: "카페", address: "서울 송파구", lat: 37.5, lng: 127.1 }
    ];
    const outcomes: SourceSearchOutcome[] = [{
      source: "naver_blog",
      query: "잠실역 카페 휠체어",
      results: [
        result("A카페 방문", "휠체어 지하철 접근 가능", "https://example.com/transit"),
        result("잠실역 B카페 방문", "매장 출입구는 휠체어 이용 가능", "https://example.com/venue"),
        result("잠실 카페 모음", "휠체어 이용 가능", "https://example.com/generic")
      ]
    }];
    const runner: SearchQueryRunner = { searchQueries: async () => outcomes };
    const matched = await attachBroadAccessibilityEvidence({
      intent,
      origin: { name: "잠실역", lat: 37.513, lng: 127.1, provider: "test" },
      candidates,
      reviewSearch: runner,
      placeProvider: placeProvider(),
      maxCalls: 4
    });

    expect(matched.candidates.find((item) => item.name === "A카페")?.discoveryEvidence).toBeUndefined();
    expect(matched.candidates.find((item) => item.name === "B카페")?.discoveryEvidence).toHaveLength(1);
    expect(matched.diagnostics).toMatchObject({ matched_candidates: 1, matched_evidence: 1 });
  });

  it("discovers a Kakao-validated place only when its full name is present in positive evidence", async () => {
    const intent = resolveSearchIntent({ location: "잠실역", category: "cafe" }, { defaultRadiusM: 1000, defaultLimit: 5 });
    const discovered: PlaceCandidate = {
      sourcePlaceId: "3",
      name: "수채화플랜트",
      category: "음식점 > 카페",
      address: "서울 송파구 송파동",
      lat: 37.51,
      lng: 127.108
    };
    const outcomes: SourceSearchOutcome[] = [{
      source: "naver_blog",
      query: "잠실역 카페 휠체어 출입",
      results: [result(
        "조용한 송리단길 카페 수채화플랜트",
        "수채화플랜트 출입구와 좌석은 휠체어 이용 가능",
        "https://example.com/watercolor-plant"
      )]
    }];
    const matched = await attachBroadAccessibilityEvidence({
      intent,
      origin: { name: "잠실역", lat: 37.513, lng: 127.1, provider: "test" },
      candidates: [],
      reviewSearch: { searchQueries: async () => outcomes },
      placeProvider: placeProvider([discovered]),
      maxCalls: 4,
      maxLookups: 4
    });

    expect(matched.candidates).toEqual([
      expect.objectContaining({ name: "수채화플랜트", discoveryEvidence: [expect.objectContaining({ place_match_score: expect.any(Number) })] })
    ]);
    expect(matched.diagnostics).toMatchObject({ discovered_candidates: 1 });
    expect(matched.diagnostics.lookup_calls).toBeGreaterThanOrEqual(1);
    expect(matched.diagnostics.lookup_calls).toBeLessThanOrEqual(4);
  });

  it("prioritizes an explicitly titled venue over generic accessibility-industry results", async () => {
    const intent = resolveSearchIntent({ location: "부산 서면역", category: "restaurant" }, { defaultRadiusM: 1000, defaultLimit: 5 });
    const target: PlaceCandidate = {
      sourcePlaceId: "1974",
      name: "1974골목",
      category: "음식점 > 한식",
      address: "부산 부산진구 부전동",
      lat: 35.155,
      lng: 129.057
    };
    const outcomes: SourceSearchOutcome[] = [{
      source: "naver_blog",
      query: "부산 서면역 음식점 휠체어 출입",
      results: [
        result("부산 스터디카페 배리어프리 키오스크 지원사업", "카페와 음식점의 배리어프리 지원 안내", "https://example.com/noise"),
        result("[부산 부전동 음식점] 1974골목 + 휠체어 가능", "1층 매장이라 휠체어 출입이 가능함", "https://example.com/1974")
      ]
    }];

    const matched = await attachBroadAccessibilityEvidence({
      intent,
      origin: { name: "서면역", lat: 35.157, lng: 129.059, provider: "test" },
      candidates: [],
      reviewSearch: { searchQueries: async () => outcomes },
      placeProvider: placeProvider([target]),
      maxCalls: 4,
      maxLookups: 1
    });

    expect(matched.candidates.map((item) => item.name)).toEqual(["1974골목"]);
    expect(matched.diagnostics.lookup_terms).toEqual(["1974골목"]);
  });
});
