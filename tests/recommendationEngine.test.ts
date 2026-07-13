import { describe, expect, it } from "vitest";
import { config } from "../src/config.js";
import { runRecommendationEngine, type PlaceEngineClient, type ReviewEngineService } from "../src/search/recommendationEngine.js";
import type {
  PlaceCandidate,
  ReviewAnalysis,
  ReviewEvidence,
  ReviewSignal,
  SourceSearchOutcome,
  SupportFacility
} from "../src/types.js";

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

function analysis(place: PlaceCandidate, overrides: Partial<ReviewAnalysis> = {}): ReviewAnalysis {
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
    attribution: [],
    ...overrides
  };
}

function placeClientFor(
  candidates: PlaceCandidate[],
  origin = { name: "잠실역", lat: 37.513, lng: 127.1, provider: "test" }
): PlaceEngineClient {
  return {
    resolveLocation: async () => origin,
    searchNearbyPlaces: async () => candidates,
    categorySearch: async () => candidates,
    keywordSearchPage: async () => []
  };
}

function reviewServiceFor(
  analyzePlace: ReviewEngineService["analyzePlace"],
  broadOutcomes: SourceSearchOutcome[] = []
): ReviewEngineService {
  return {
    searchQueries: async () => broadOutcomes,
    analyzePlace
  };
}

const emptyPublicData = {
  findNearbySupportFacilities: () => [],
  findMatchingAccessibilityEvidence: () => []
};

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
            { limit: 3 },
            { limit: 3 },
            { limit: 3 },
            { limit: 3 },
            { limit: 3 }
          ]
        }
      }
    });
  });

  it("returns a location fallback without running candidate or review searches when the origin is unresolved", async () => {
    const placeClient: PlaceEngineClient = {
      resolveLocation: async () => ({ name: "알수없는동네", lat: 0, lng: 0, provider: "unresolved" }),
      searchNearbyPlaces: async () => { throw new Error("candidate search must not run"); },
      categorySearch: async () => { throw new Error("candidate search must not run"); },
      keywordSearchPage: async () => { throw new Error("candidate search must not run"); }
    };
    const reviewService = reviewServiceFor(async () => {
      throw new Error("review analysis must not run");
    });

    const output = await runRecommendationEngine(
      { location: "알수없는동네", category: "cafe" },
      { ...config, kakaoRestApiKey: "test" },
      {
        createPlaceClient: () => placeClient,
        createReviewService: () => reviewService,
        createPublicDataClient: () => emptyPublicData
      }
    );

    expect(output).toMatchObject({
      fallback_used: false,
      fallback_reason: "location_unresolved",
      candidate_pipeline: {
        analyzed_candidates: 0,
        broad_evidence: { calls: 0 }
      },
      request_budget: {
        used: 0,
        allocations: { review: { candidates: [] } }
      }
    });
  });

  it("reports missing Kakao credentials before the generic no-candidate fallback", async () => {
    const output = await runRecommendationEngine(
      { location: "잠실역", category: "cafe" },
      { ...config, kakaoRestApiKey: undefined },
      {
        createPlaceClient: () => placeClientFor([]),
        createReviewService: () => reviewServiceFor(async (place) => analysis(place)),
        createPublicDataClient: () => emptyPublicData
      }
    );

    expect(output).toMatchObject({
      fallback_reason: "kakao_local_credentials_missing",
      candidate_pipeline: { raw_count: 0, analyzed_candidates: 0 }
    });
  });

  it("reports the generic Kakao no-candidate fallback when credentials and location are valid", async () => {
    const output = await runRecommendationEngine(
      { location: "잠실역", category: "cafe" },
      { ...config, kakaoRestApiKey: "test" },
      {
        createPlaceClient: () => placeClientFor([]),
        createReviewService: () => reviewServiceFor(async (place) => analysis(place)),
        createPublicDataClient: () => emptyPublicData
      }
    );

    expect(output).toMatchObject({
      fallback_reason: "kakao_local_unavailable_or_no_candidates",
      candidate_pipeline: { raw_count: 0, analyzed_candidates: 0 }
    });
  });

  it("explains when an explicit content preference filters every area-matched candidate", async () => {
    const restaurant: PlaceCandidate = {
      sourcePlaceId: "restaurant-1",
      name: "일반한식당",
      category: "음식점 > 한식",
      address: "서울 송파구",
      lat: 37.512,
      lng: 127.1
    };

    const output = await runRecommendationEngine(
      { location: "잠실역", category: "restaurant", preferences: ["햄버거"] },
      { ...config, kakaoRestApiKey: "test" },
      {
        createPlaceClient: () => placeClientFor([restaurant]),
        createReviewService: () => reviewServiceFor(async () => {
          throw new Error("filtered candidates must not be analyzed");
        }),
        createPublicDataClient: () => emptyPublicData
      }
    );

    expect(output).toMatchObject({
      fallback_reason: "content_preference_filtered_all_candidates",
      candidate_pipeline: {
        area_matched_count: 1,
        hard_content_filter_applied: true,
        hard_content_filtered_count: 1,
        analyzed_candidates: 0
      }
    });
  });

  it("returns verification-required candidates when reviews contain no positive venue evidence", async () => {
    const output = await runRecommendationEngine(
      { location: "잠실역", category: "cafe", limit: 2 },
      { ...config, kakaoRestApiKey: "test" },
      {
        createPlaceClient: () => placeClientFor(places),
        createReviewService: () => reviewServiceFor(async (place) => analysis(place, {
          review_signal_grade: "R4",
          review_signal_score: 0,
          positive_signals: [],
          results: []
        })),
        createPublicDataClient: () => emptyPublicData
      }
    );

    expect(output).toMatchObject({
      recommendations: [],
      fallback_used: true,
      fallback_reason: "review_positive_results_below_threshold",
      candidate_pipeline: {
        analyzed_candidates: 2,
        verified_recommendations: 0,
        verification_required_candidates: 2
      }
    });
    expect(output.fallback_recommendations).toHaveLength(2);
  });

  it("fills a verified-result shortfall with clearly unverified candidates", async () => {
    const thirdPlace: PlaceCandidate = {
      sourcePlaceId: "3",
      name: "추가카페",
      category: "카페",
      address: "서울 송파구",
      lat: 37.512,
      lng: 127.102
    };
    const output = await runRecommendationEngine(
      { location: "잠실역", category: "cafe" },
      { ...config, kakaoRestApiKey: "test" },
      {
        createPlaceClient: () => placeClientFor([...places, thirdPlace]),
        createReviewService: () => reviewServiceFor(async (place) => analysis(place)),
        createPublicDataClient: () => emptyPublicData
      }
    );

    expect(output).toMatchObject({
      recommendations: [expect.objectContaining({ name: "검증카페" })],
      fallback_used: true,
      fallback_reason: "review_positive_results_below_threshold",
      candidate_pipeline: {
        verified_recommendations: 1,
        verification_required_candidates: 2
      }
    });
    expect(output.fallback_recommendations).toEqual([
      expect.objectContaining({ name: "추가카페", accessibility_status: "unverified" }),
      expect.objectContaining({ name: "일반카페", accessibility_status: "unverified" })
    ]);
    expect(String(output.answer_markdown)).toContain("추가 확인 필요 후보 2곳");
  });

  it("progressively analyzes later candidates until three verified results are found", async () => {
    const progressivePlaces: PlaceCandidate[] = Array.from({ length: 8 }, (_, index) => ({
      sourcePlaceId: String(index + 1),
      name: `점진후보${index + 1}`,
      category: "카페",
      address: "서울 송파구",
      lat: 37.513 + index * 0.0001,
      lng: 127.1
    }));
    const analyzedNames: string[] = [];
    const verifiedNames = new Set(["점진후보1", "점진후보6", "점진후보7"]);

    const output = await runRecommendationEngine(
      { location: "잠실역", category: "cafe" },
      {
        ...config,
        kakaoRestApiKey: "test",
        maxExternalApiCallsPerRequest: 40,
        maxPlaceCandidates: 15,
        reviewCandidateConcurrency: 2
      },
      {
        createPlaceClient: () => placeClientFor(progressivePlaces),
        createReviewService: (_config, budget) => ({
          searchQueries: async () => [],
          analyzePlace: async (place) => {
            analyzedNames.push(place.name);
            budget.tryConsume(budget.remaining);
            const verified = verifiedNames.has(place.name);
            return analysis(place, {
              review_signal_grade: verified ? "R1" : "R4",
              review_signal_score: verified ? 80 : 0,
              positive_signals: verified ? venueEvidence.signals : [],
              results: verified ? [{ ...venueEvidence, title: `${place.name} 접근성 후기` }] : []
            });
          }
        }),
        createPublicDataClient: () => emptyPublicData
      }
    );

    expect(analyzedNames).toHaveLength(7);
    expect(analyzedNames).not.toContain("점진후보8");
    expect(output).toMatchObject({
      fallback_used: false,
      fallback_reason: null,
      candidate_pipeline: {
        analyzed_candidates: 7,
        verified_recommendations: 3,
        verification_required_candidates: 0
      },
      request_budget: {
        allocations: { review: { limit: 20, used: 20 } }
      }
    });
    expect((output.recommendations as Array<{ name: string }>).map((item) => item.name)).toEqual([
      "점진후보1",
      "점진후보6",
      "점진후보7"
    ]);
  });

  it("keeps strong negative review signals out of fallback recommendations", async () => {
    const negativeSignal: ReviewSignal = {
      polarity: "negative",
      type: "stairs",
      strength: "strong",
      matched_text: "계단만 있어 휠체어 출입 불가",
      subject: "venue"
    };
    const negativeEvidence: ReviewEvidence = {
      ...venueEvidence,
      title: "일반카페 접근성 후기",
      snippet: "계단만 있어 휠체어 출입 불가",
      signals: [negativeSignal]
    };

    const output = await runRecommendationEngine(
      { location: "잠실역", category: "cafe", limit: 1 },
      { ...config, kakaoRestApiKey: "test" },
      {
        createPlaceClient: () => placeClientFor([places[1]!]),
        createReviewService: () => reviewServiceFor(async (place) => analysis(place, {
          review_signal_grade: "W",
          review_signal_score: -80,
          positive_signals: [],
          negative_signals: [negativeSignal],
          results: [negativeEvidence]
        })),
        createPublicDataClient: () => emptyPublicData
      }
    );

    expect(output.not_recommended_places).toHaveLength(1);
    expect(output.fallback_recommendations).toEqual([]);
    expect(output).toMatchObject({
      fallback_used: false,
      candidate_pipeline: { verification_required_candidates: 0 }
    });
  });

  it("applies restroom, charger, and elevator preference bonuses using nearby support distance", async () => {
    const preferenceSignals: ReviewSignal[] = [
      ...venueEvidence.signals,
      {
        polarity: "positive",
        type: "restroom",
        strength: "medium",
        matched_text: "장애인 화장실 있음",
        subject: "venue"
      },
      {
        polarity: "positive",
        type: "elevator",
        strength: "medium",
        matched_text: "엘리베이터 있음",
        subject: "venue"
      }
    ];
    const preferenceAnalysis = (place: PlaceCandidate) => analysis(place, {
      review_signal_grade: "R1",
      review_signal_score: 80,
      positive_signals: preferenceSignals,
      results: [{ ...venueEvidence, title: `${place.name} 방문 후기`, signals: preferenceSignals }]
    });
    const facilitiesFor = (place: PlaceCandidate): SupportFacility[] => {
      const near = place.name === "검증카페";
      return [
        {
          type: "accessible_restroom",
          name: `${place.name} 인근 화장실`,
          lat: place.lat,
          lng: place.lng,
          source: "test",
          match_basis: "coordinates",
          distance_m: near ? 200 : 800
        },
        {
          type: "wheelchair_charger",
          name: `${place.name} 인근 충전기`,
          lat: place.lat,
          lng: place.lng,
          source: "test",
          match_basis: "coordinates",
          distance_m: near ? 400 : 900
        }
      ];
    };

    const output = await runRecommendationEngine(
      {
        location: "잠실역",
        category: "cafe",
        limit: 2,
        preferences: ["장애인화장실", "충전기근처", "엘리베이터"]
      },
      { ...config, kakaoRestApiKey: "test" },
      {
        createPlaceClient: () => placeClientFor(places),
        createReviewService: () => reviewServiceFor(async (place) => preferenceAnalysis(place)),
        createPublicDataClient: () => ({
          findNearbySupportFacilities: (place) => facilitiesFor(place as PlaceCandidate),
          findMatchingAccessibilityEvidence: () => []
        })
      }
    );

    const recommendations = output.recommendations as Array<Record<string, unknown>>;
    expect(recommendations.map((item) => item.name)).toEqual(["검증카페", "일반카페"]);
    expect(recommendations.find((item) => item.name === "검증카페")).toEqual(
      expect.objectContaining({ ranking_score: 630, official_support_grade: "O2" })
    );
    expect(recommendations.find((item) => item.name === "일반카페")).toEqual(
      expect.objectContaining({ ranking_score: 616, official_support_grade: "O2" })
    );
  });
});
