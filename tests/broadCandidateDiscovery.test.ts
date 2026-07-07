import { describe, expect, it } from "vitest";
import {
  buildKakaoLookupTerms,
  buildBroadDiscoveryQueries,
  extractBroadCandidateTerms,
  mergePlaceCandidates
} from "../src/reviewSearch/broadCandidateDiscovery.js";

describe("broad candidate discovery", () => {
  it("builds broad accessibility-first search queries", () => {
    const queries = buildBroadDiscoveryQueries("사당역", "cafe");

    expect(queries[0]).toBe("사당역 카페 휠체어");
    expect(queries).toContain("사당역 카페 문턱 경사로");
  });

  it("adds restaurant aliases and cuisine preference queries", () => {
    const queries = buildBroadDiscoveryQueries("제주도", "restaurant", ["마라탕"]);

    expect(queries).toContain("제주도 휠체어 식당");
    expect(queries).toContain("제주도 맛집 휠체어");
    expect(queries).toContain("제주도 마라탕 휠체어");
  });

  it("adds local aliases for campus-style locations", () => {
    const queries = buildBroadDiscoveryQueries("성균관대 자연과학캠퍼스", "cafe");

    expect(queries).toContain("성균관대역 카페 휠체어");
    expect(queries).toContain("율전동 카페 휠체어");
  });

  it("extracts likely place terms from broad search titles", () => {
    const terms = extractBroadCandidateTerms(
      {
        title: "사당역 카페 휠체어 이용 가능한 조가네커피 방문 후기",
        snippet: "문턱 없이 들어갈 수 있고 유모차도 가능했습니다."
      },
      "사당역",
      "cafe"
    );

    expect(terms).toContain("조가네커피");
  });

  it("keeps discovered candidates before local candidates while deduping", () => {
    const merged = mergePlaceCandidates(
      [{ sourcePlaceId: "2", name: "검색발굴", category: "cafe", lat: 0, lng: 0 }],
      [
        { sourcePlaceId: "1", name: "일반후보", category: "cafe", lat: 0, lng: 0 },
        { sourcePlaceId: "2", name: "검색발굴", category: "cafe", lat: 0, lng: 0 }
      ]
    );

    expect(merged.map((place) => place.name)).toEqual(["검색발굴", "일반후보"]);
  });

  it("creates shorter Kakao lookup terms from noisy discovery phrases", () => {
    const terms = buildKakaoLookupTerms("방배동빵집 블랑제리 르팡 인생빵집");

    expect(terms).toContain("블랑제리 르팡");
  });

  it("extracts place names from bracketed and noisy Hongdae titles", () => {
    const bracketed = extractBroadCandidateTerms(
      {
        title: "[홍대입구역/카페/thefamouslamb] 휠체어 이용 가능 후기",
        snippet: "엘리베이터가 있어서 휠체어 타신 분들도 이용 가능해보였습니다."
      },
      "홍대입구역",
      "cafe"
    );
    const noisy = extractBroadCandidateTerms(
      {
        title: "홍대입구역카페 공미학 마포홍대점 시그니처 쑥 라떼",
        snippet: "장애인 휠체어 이용이 가능한 출입구가 있습니다."
      },
      "홍대입구역",
      "cafe"
    );

    expect(bracketed).toContain("thefamouslamb");
    expect(noisy).toContain("공미학");
  });

  it("prioritizes concrete Jeju restaurant names over generic travel phrases", () => {
    const restaurant = extractBroadCandidateTerms(
      {
        title: "휠체어 타고 방문한 제주 음식점 인디언키친 공항점",
        snippet: "인디언키친 공항점 음식점 정보. 경사로가 있어 휠체어로 편하게 접근할 수 있습니다."
      },
      "제주도",
      "restaurant"
    );
    const named = extractBroadCandidateTerms(
      {
        title: "[제주도 맛집] 삼화포구... 검은모래해변서 맨발걷기 좋은 음식점",
        snippet: "문턱이 없어 휠체어를 타고 들어갈 수 있는 음식점입니다."
      },
      "제주도",
      "restaurant"
    );

    expect(restaurant[0]).toContain("인디언키친");
    expect(named[0]).toContain("삼화포구");
  });

  it("keeps discovery evidence when discovered candidates are deduped", () => {
    const merged = mergePlaceCandidates(
      [
        {
          sourcePlaceId: "1",
          name: "공미학",
          category: "cafe",
          lat: 0,
          lng: 0,
          discoveryEvidence: [
            {
              source: "naver_blog",
              title: "홍대입구역카페 공미학 휠체어 후기",
              link: "https://example.com/1",
              snippet: "장애인 휠체어 이용이 가능한 출입구가 있습니다.",
              date: null,
              place_match_score: 0.85,
              signals: [
                {
                  polarity: "positive",
                  type: "wheelchair_direct",
                  matched_text: "휠체어 이용이 가능",
                  strength: "strong"
                }
              ]
            }
          ]
        }
      ],
      [{ sourcePlaceId: "1", name: "공미학", category: "cafe", lat: 0, lng: 0 }]
    );

    expect(merged[0]?.discoveryEvidence).toHaveLength(1);
  });
});
