import { describe, expect, it } from "vitest";
import type { RankedPlace } from "../src/types.js";
import { buildRecommendResponse } from "../src/reviewSearch/reviewResponseBuilder.js";

const ranked: RankedPlace = {
  place: {
    name: "A카페",
    category: "cafe",
    address: "서울",
    phone: "02-123-4567",
    lat: 37.5,
    lng: 127,
    distance_m: 100,
    sourcePlaceId: "12345"
  },
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
  support_facilities_nearby: [
    {
      type: "accessible_restroom",
      name: "홍대입구역 장애인화장실",
      address: "서울 마포구",
      lat: 37.55,
      lng: 126.92,
      distance_m: 180,
      source: "전국공중화장실표준데이터"
    },
    {
      type: "wheelchair_charger",
      name: "홍대입구역 급속충전기",
      address: "서울 마포구 양화로",
      lat: 37.551,
      lng: 126.921,
      distance_m: 450,
      source: "전국전동휠체어급속충전기표준데이터"
    }
  ]
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
    expect(response).toHaveProperty("answer_markdown");
    expect(response).toHaveProperty("answer_usage_note");
    expect(text).toContain("1순위. A카페");
    expect(text).toContain("추천 이유: 엘리베이터 있음 언급이 있는 후기 신호가 확인됨");
    expect(text).toContain("출처: 네이버 블로그 - [출처 보기](https://example.com)");
    expect(text).toContain("거리: 약 100m");
    expect(text).toContain("전화: 02-123-4567");
    expect(text).toContain("지도: [카카오맵]");
    expect(text).toContain("[거리뷰](https://map.kakao.com/link/roadview/12345)");
    expect(text).toContain("주변 지원정보:");
    expect(text).toContain("- 장애인 화장실: 홍대입구역 장애인화장실, 약 180m, 서울 마포구");
    expect(text).toContain("- 전동휠체어 충전기: 홍대입구역 급속충전기, 약 450m, 서울 마포구 양화로");
    expect(response.recommendations).toEqual([
      expect.objectContaining({
        phone: "02-123-4567",
        recommendation_reason: "엘리베이터 있음 언급이 있는 후기 신호가 확인됨",
        source_line: "출처: 네이버 블로그 - [출처 보기](https://example.com)",
        map_link: expect.stringContaining("https://map.kakao.com/link/map/"),
        roadview_link: "https://map.kakao.com/link/roadview/12345",
        display_markdown: expect.stringContaining("[거리뷰](https://map.kakao.com/link/roadview/12345)"),
        source: expect.objectContaining({
          label: "네이버 블로그",
          link: "https://example.com"
        }),
        support_facilities_display: expect.arrayContaining([
          "장애인 화장실: 홍대입구역 장애인화장실, 약 180m, 서울 마포구",
          "전동휠체어 충전기: 홍대입구역 급속충전기, 약 450m, 서울 마포구 양화로"
        ])
      })
    ]);
    expect(text).toContain("Naver Search API 결과 기반 참고 신호");
    expect(text).not.toContain("휠체어 최적" + " 경로");
    expect(text).not.toContain("공식 접근성 정보" + "로 확인");
    expect(text).not.toContain("전국공중화장실표준데이터");
  });

  it("uses public evidence source when review evidence is unavailable", () => {
    const publicOnly: RankedPlace = {
      ...ranked,
      place: { name: "B카페", category: "cafe", address: "서울", lat: 37.5, lng: 127, distance_m: 250 },
      review: {
        ...ranked.review,
        place_name: "B카페",
        review_signal_grade: "R4",
        review_signal_score: 0,
        positive_signals: [],
        results: []
      },
      official_support_grade: "O1",
      recommendation_status: "official_support_only",
      public_support_evidence: [
        {
          source: "한국장애인개발원 BF 인증 정보",
          source_family: "bf_certification",
          level: "building_or_facility_level",
          evidence_type: "bf_certified",
          detail: "장애물 없는 생활환경 인증 시설로 확인됨",
          confidence: 0.9
        }
      ],
      support_facilities_nearby: []
    };
    const response = buildRecommendResponse({
      interpretation: {
        location: "홍대입구역",
        category: "cafe",
        radius_m: 800,
        preferences: [],
        unsupported_preferences: []
      },
      origin: { name: "홍대입구역", lat: 37.55, lng: 126.92 },
      recommendations: [publicOnly],
      notRecommended: [],
      unverified: [],
      fallbackUsed: false,
      fallbackReason: null,
      fallbackRecommendations: []
    });
    const text = JSON.stringify(response);
    expect(text).toContain("추천 이유: 공공데이터 기반 접근성 보조 근거가 확인됨");
    expect(text).toContain("출처: 한국장애인개발원 BF 인증 정보 - 장애물 없는 생활환경 인증 시설로 확인됨");
    expect(text).not.toContain("접근성 후기 출처 없음");
  });
});
