import { describe, expect, it } from "vitest";
import type { RankedPlace } from "../src/types.js";
import { buildRecommendResponse } from "../src/reviewSearch/reviewResponseBuilder.js";

const ranked: RankedPlace = {
  place: { name: "A카페", category: "cafe", address: "서울", lat: 37.5, lng: 127, distance_m: 100 },
  review: {
    place_name: "A카페",
    address: "서울",
    queries_used: ["A카페 홍대입구 휠체어"],
    review_signal_grade: "R1",
    review_signal_score: 80,
    positive_signals: [{ polarity: "positive", strength: "strong", type: "elevator", matched_text: "엘리베이터 있음" }],
    negative_signals: [],
    ambiguous_signals: [],
    results: [
      {
        source: "naver_blog",
        title: "A카페",
        link: "https://example.com",
        snippet: "엘리베이터 있음",
        date: "20260701",
        place_match_score: 0.9,
        signals: [{ polarity: "positive", strength: "strong", type: "elevator", matched_text: "엘리베이터 있음" }]
      }
    ],
    searched_sources: ["naver_blog"],
    source_counts: { naver_blog: 1, naver_cafe: 0, naver_web: 0, daum_blog: 0, daum_cafe: 0, daum_web: 0 },
    unavailable_sources: {},
    cautions: [],
    attribution: ["Naver Search API 결과 기반 참고 신호"]
  },
  official_support_grade: "none",
  recommendation_status: "review_positive",
  ranking_score: 580,
  official_support_score: 0,
  public_support_evidence: [],
  support_facilities_nearby: []
};

describe("buildRecommendResponse", () => {
  it("separates review and public evidence and avoids overclaim wording", () => {
    const response = buildRecommendResponse({
      interpretation: {
        location: "홍대입구역",
        category: "cafe",
        radius_m: 800,
        preferences: [],
        unsupported_preferences: []
      },
      origin: { name: "홍대입구역", lat: 37.55, lng: 126.92 },
      recommendations: [ranked],
      notRecommended: [],
      unverified: [],
      fallbackUsed: false,
      fallbackReason: null,
      fallbackRecommendations: []
    });
    const text = JSON.stringify(response);
    expect(text).toContain("후기 기반 접근성 신호");
    expect(text).toContain("공공데이터 기반 보조 근거");
    expect(text).toContain("Naver Search API 결과 기반 참고 신호");
    expect(text).not.toContain("휠체어 최적" + " 경로");
    expect(text).not.toContain("공식 접근성 정보" + "로 확인");
  });
});
