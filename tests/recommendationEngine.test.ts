import { describe, expect, it } from "vitest";
import { config } from "../src/config.js";
import { runRecommendationEngine, type PlaceEngineClient, type ReviewEngineService } from "../src/search/recommendationEngine.js";
import type { PlaceCandidate, ReviewAnalysis, ReviewEvidence, SourceSearchOutcome } from "../src/types.js";

const places: PlaceCandidate[] = [
  { sourcePlaceId: "1", name: "검증카페", category: "카페", address: "서울 송파구", lat: 37.51, lng: 127.1, phone: "02-1234-5678" },
  { sourcePlaceId: "2", name: "일반카페", category: "카페", address: "서울 송파구", lat: 37.511, lng: 127.101 }
];

const venueEvidence: ReviewEvidence = {
  source: "naver_blog",
  title: "검증카페 방문 후기",
  snippet: "검증카페 매장 출입구는 휠체어 이용 가능",
  link: "https://example.com/verified",
  date: "20260701",
  place_match_score: 0.9,
  signals: [{
    polarity: "positive",
    type: "wheelchair_direct",
    strength: "strong",
    matched_text: "휠체어 이용 가능",
    subject: "venue"
  }]
};

function analysis(place: PlaceCandidate): ReviewAnalysis {
  const verified = place.name === "검증카페";
  return {
    place_name: place.name,
    address: place.address,
    queries_used: [`${place.name} 휠체어`],
    review_signal_grade: verified ? "R1" : "R4",
    review_signal_score: verified ? 80 : 0,
    positive_signals: verified ? venueEvidence.signals : [],
    negative_signals: [],
    ambiguous_signals: [],
    results: verified ? [venueEvidence] : [],
    searched_sources: ["naver_blog", "daum_blog"],
    source_counts: { naver_blog: 1, naver_cafe: 0, naver_web: 0, daum_blog: 0, daum_cafe: 0, daum_web: 0 },
    unavailable_sources: {},
    cautions: [],
    attribution: []
  };
}

describe("place-first recommendation engine", () => {
  it("runs intent, known-place candidate search, evidence mapping, and ranking end to end", async () => {
    const placeClient: PlaceEngineClient = {
      resolveLocation: async () => ({ name: "잠실역", lat: 37.513, lng: 127.1, provider: "test" }),
      searchNearbyPlaces: async () => places,
      categorySearch: async () => places,
      keywordSearchPage: async () => []
    };
    const broadOutcomes: SourceSearchOutcome[] = [{
      source: "naver_blog",
      query: "잠실역 카페 휠체어 출입",
      results: [{
        source: "naver_blog",
        title: venueEvidence.title,
        snippet: venueEvidence.snippet,
        link: venueEvidence.link,
        date: venueEvidence.date
      }]
    }];
    const reviewService: ReviewEngineService = {
      searchQueries: async () => broadOutcomes,
      analyzePlace: async (place) => analysis(place)
    };
    const output = await runRecommendationEngine(
      { query: "잠실역 근처 휠체어 접근성 좋은 카페 찾아줘" },
      { ...config, kakaoRestApiKey: "test", maxExternalApiCallsPerRequest: 40, maxPlaceCandidates: 15 },
      {
        createPlaceClient: () => placeClient,
        createReviewService: () => reviewService,
        createPublicDataClient: () => ({
          findNearbySupportFacilities: () => [],
          findMatchingAccessibilityEvidence: () => []
        })
      }
    );

    expect(output.search_architecture).toBe("place_first_evidence_second_v2");
    expect(output.recommendations).toEqual([
      expect.objectContaining({ name: "검증카페", review_signal_grade: "R1" })
    ]);
    expect(output.candidate_pipeline).toMatchObject({
      raw_count: 2,
      broad_evidence: { matched_candidates: 1 },
      verified_recommendations: 1
    });
    expect(output.request_budget).toMatchObject({
      limit: 40,
      allocations: {
        local: { limit: 8 },
        broad_evidence: { limit: 12 },
        review: { limit: 20 }
      }
    });
  });

  it("analyzes candidates with bounded concurrency while preserving budget allocation", async () => {
    const concurrentPlaces: PlaceCandidate[] = Array.from({ length: 5 }, (_, index) => ({
      sourcePlaceId: String(index + 1),
      name: `후보카페${index + 1}`,
      category: "카페",
      address: "서울 송파구",
      lat: 37.51 + index * 0.0001,
      lng: 127.1
    }));
    const placeClient: PlaceEngineClient = {
      resolveLocation: async () => ({ name: "잠실역", lat: 37.513, lng: 127.1, provider: "test" }),
      searchNearbyPlaces: async () => concurrentPlaces,
      categorySearch: async () => concurrentPlaces,
      keywordSearchPage: async () => []
    };
    let active = 0;
    let maxActive = 0;
    const reviewService: ReviewEngineService = {
      searchQueries: async () => [],
      analyzePlace: async (place) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 20));
        active -= 1;
        return analysis(place);
      }
    };

    const output = await runRecommendationEngine(
      { query: "잠실역 근처 카페", limit: 5 },
      {
        ...config,
        kakaoRestApiKey: "test",
        maxExternalApiCallsPerRequest: 41,
        maxPlaceCandidates: 15,
        reviewCandidateConcurrency: 2
      },
      {
        createPlaceClient: () => placeClient,
        createReviewService: () => reviewService,
        createPublicDataClient: () => ({
          findNearbySupportFacilities: () => [],
          findMatchingAccessibilityEvidence: () => []
        })
      }
    );

    expect(maxActive).toBe(2);
    expect(output.request_budget).toMatchObject({
      allocations: {
        review: {
          limit: 21,
          candidates: [
            { limit: 4 },
            { limit: 4 },
            { limit: 4 },
            { limit: 4 },
            { limit: 5 }
          ]
        }
      }
    });
  });
});
