import { describe, expect, it } from "vitest";
import { buildCandidatePool, type PlaceSearchProvider } from "../src/search/candidateSearch.js";
import { resolveSearchIntent } from "../src/search/intentResolver.js";
import type { Origin, PlaceCandidate } from "../src/types.js";

const origin: Origin = { name: "제주특별자치도청", lat: 33.49, lng: 126.5, provider: "test" };

function place(id: string, name: string, category: string, address = "제주특별자치도 제주시 테스트동"): PlaceCandidate {
  return { sourcePlaceId: id, name, category, address, lat: 33.49, lng: 126.5 };
}

function provider(input: {
  category?: PlaceCandidate[];
  keywords?: Record<string, PlaceCandidate[]>;
}): PlaceSearchProvider {
  return {
    searchNearbyPlaces: async () => input.category ?? [],
    categorySearch: async () => input.category ?? [],
    keywordSearchPage: async (query) => input.keywords?.[query] ?? []
  };
}

describe("place-first candidate search", () => {
  it("prioritizes content matches without deleting generic fallback places", async () => {
    const intent = resolveSearchIntent({ query: "제주도 횟집 휠체어" }, { defaultRadiusM: 1000, defaultLimit: 5 });
    const result = await buildCandidatePool({
      intent,
      origin,
      provider: provider({
        category: [place("1", "일반식당", "음식점 > 한식")],
        keywords: {
          "제주도 횟집": [place("2", "바다횟집", "음식점 > 일식 > 횟집")],
          "제주도 회": [place("2", "바다횟집", "음식점 > 일식 > 횟집")]
        }
      })
    });

    expect(result.candidates.map((item) => item.name)).toEqual(["바다횟집", "일반식당"]);
    expect(result.diagnostics.content_matched_count).toBe(1);
    expect(result.diagnostics.content_relaxed).toBe(false);
  });

  it("relaxes an inferred content term instead of returning an empty pool", async () => {
    const intent = resolveSearchIntent({ query: "제주도 딤섬 맛집 휠체어" }, { defaultRadiusM: 1000, defaultLimit: 5 });
    const result = await buildCandidatePool({
      intent,
      origin,
      provider: provider({ category: [place("1", "일반식당", "음식점 > 한식")] })
    });

    expect(result.candidates).toHaveLength(1);
    expect(result.diagnostics.content_matched_count).toBe(0);
    expect(result.diagnostics.content_relaxed).toBe(true);
  });

  it("enforces an explicit content preference and trusts its Kakao keyword result", async () => {
    const intent = resolveSearchIntent({
      location: "제주도",
      category: "restaurant",
      preferences: ["오마카세"]
    }, { defaultRadiusM: 1000, defaultLimit: 5 });
    const result = await buildCandidatePool({
      intent,
      origin,
      provider: provider({
        category: [place("1", "일반식당", "음식점 > 한식")],
        keywords: {
          "제주도 오마카세": [place("2", "스시이도", "음식점 > 일식 > 초밥")]
        }
      })
    });

    expect(result.candidates.map((item) => item.name)).toEqual(["스시이도"]);
    expect(result.diagnostics).toMatchObject({
      hard_content_filter_applied: true,
      hard_content_filtered_count: 1,
      content_relaxed: false
    });
  });

  it("returns an explicit no-match instead of silently recommending the wrong content", async () => {
    const intent = resolveSearchIntent({
      location: "제주도",
      category: "restaurant",
      preferences: ["딤섬"]
    }, { defaultRadiusM: 1000, defaultLimit: 5 });
    const result = await buildCandidatePool({
      intent,
      origin,
      provider: provider({ category: [place("1", "일반식당", "음식점 > 한식")] })
    });

    expect(result.candidates).toEqual([]);
    expect(result.diagnostics).toMatchObject({
      area_matched_count: 1,
      content_matched_count: 0,
      hard_content_filter_applied: true,
      hard_content_filtered_count: 1,
      content_relaxed: false
    });
  });

  it("removes candidates outside a regional address boundary", async () => {
    const intent = resolveSearchIntent({ location: "제주도", category: "restaurant" }, { defaultRadiusM: 1000, defaultLimit: 5 });
    const result = await buildCandidatePool({
      intent,
      origin,
      provider: provider({
        category: [
          place("1", "제주식당", "음식점 > 한식"),
          place("2", "서울식당", "음식점 > 한식", "서울특별시 종로구 테스트로")
        ]
      })
    });

    expect(result.candidates.map((item) => item.name)).toEqual(["제주식당"]);
    expect(result.diagnostics.area_matched_count).toBe(1);
  });
});
