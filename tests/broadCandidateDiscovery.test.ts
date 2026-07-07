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
});
