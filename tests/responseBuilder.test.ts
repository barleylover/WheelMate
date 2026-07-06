import { describe, expect, it } from "vitest";
import { buildRecommendationResponse } from "../src/core/responseBuilder.js";
import type { ScoredPlace } from "../src/core/types.js";

const scoredPlace: ScoredPlace = {
  place: {
    id: "google:1",
    name: "A카페",
    category: "cafe",
    address: "서울 마포구 양화로 1",
    lat: 37.5572,
    lng: 126.9254,
    source: "Google Places",
    googleMapsUri: "https://maps.google.com/?cid=1",
    evidence: [
      {
        source: "Google Places",
        level: "store_level",
        evidenceType: "wheelchair_entrance",
        value: true,
        detail: "wheelchairAccessibleEntrance=true",
        confidence: 0.8
      },
      {
        source: "OSM",
        level: "store_level",
        evidenceType: "osm_wheelchair",
        value: "yes",
        detail: "wheelchair=yes",
        confidence: 0.65
      }
    ]
  },
  distanceM: 320,
  score: 92,
  grade: "A",
  excluded: false,
  supportFacilitiesNearby: []
};

describe("responseBuilder", () => {
  it("separates confirmed and unknown information", () => {
    const result = buildRecommendationResponse({
      inputLocation: "홍대입구역",
      category: "cafe",
      radiusM: 800,
      origin: { name: "홍대입구역", lat: 37.557192, lng: 126.925381 },
      scoredPlaces: [scoredPlace],
      limit: 5,
      fallbackUsed: false,
      excludeFranchise: false,
      sourceStatus: []
    });

    expect(result.recommendations[0]?.confirmed_accessibility).toContain("휠체어 이용 가능 입구");
    expect(result.recommendations[0]?.unknown_or_unverified).toContain("실제 문턱 높이");
    expect(result.message_for_user).toContain("확인된 접근성 정보");
    expect(result.message_for_user).toContain("확인되지 않은 정보");
  });

  it("does not describe Kakao route as wheelchair optimized", () => {
    const result = buildRecommendationResponse({
      inputLocation: "홍대입구역",
      category: "cafe",
      radiusM: 800,
      origin: { name: "홍대입구역", lat: 37.557192, lng: 126.925381 },
      scoredPlaces: [scoredPlace],
      limit: 5,
      fallbackUsed: false,
      excludeFranchise: false,
      sourceStatus: []
    });

    expect(result.message_for_user).toContain("카카오맵 길찾기");
    expect(result.message_for_user).not.toContain(["휠체어", "최적", "경로"].join(" "));
  });

  it("includes source attribution", () => {
    const result = buildRecommendationResponse({
      inputLocation: "홍대입구역",
      category: "cafe",
      radiusM: 800,
      origin: { name: "홍대입구역", lat: 37.557192, lng: 126.925381 },
      scoredPlaces: [scoredPlace],
      limit: 5,
      fallbackUsed: false,
      excludeFranchise: false,
      sourceStatus: []
    });

    expect(result.recommendations[0]?.attribution).toContain("Google Places 접근성 정보 사용");
    expect(result.recommendations[0]?.attribution).toContain("OpenStreetMap contributors");
  });

  it("추천 이유와 카카오맵 위치/길찾기 링크를 제공한다", () => {
    const result = buildRecommendationResponse({
      inputLocation: "홍대입구역",
      category: "cafe",
      radiusM: 1000,
      origin: { name: "홍대입구역", lat: 37.557192, lng: 126.925381 },
      scoredPlaces: [scoredPlace],
      limit: 3,
      fallbackUsed: false,
      excludeFranchise: false,
      sourceStatus: []
    });

    const rec = result.recommendations[0];
    expect(rec?.recommendation_reason).toContain("출발지에서");
    expect(rec?.links.kakao_map).toContain("map.kakao.com");
    expect(rec?.links.kakao_route).toContain("map.kakao.com/?sName=");
    expect(rec?.links.kakao_route).not.toContain("/link/to/");
  });
});
