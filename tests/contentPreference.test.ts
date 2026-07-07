import { describe, expect, it } from "vitest";
import {
  contentSearchPreferences,
  inferCategoryFromQuery,
  inferLocationFromQuery,
  resolveRecommendSearchIntent
} from "../src/mcp/tools/recommendAccessiblePlacesByReviewSearch.js";

describe("contentSearchPreferences", () => {
  it("drops wheelchair accessibility words from concrete content filters", () => {
    expect(contentSearchPreferences(["햄버거", "휠체어"])).toEqual(["햄버거", "버거"]);
  });

  it("normalizes restaurant suffixes and expands common synonyms", () => {
    expect(contentSearchPreferences(["햄버거집"])).toEqual(["햄버거", "버거"]);
    expect(contentSearchPreferences(["초밥집"])).toEqual(["초밥", "스시"]);
    expect(contentSearchPreferences(["횟집"])).toEqual(["횟집", "회", "생선회"]);
  });

  it("keeps non-food place types while removing generic terms", () => {
    expect(contentSearchPreferences(["약국", "접근성", "추천"])).toEqual(["약국"]);
  });

  it("infers location from natural language queries", () => {
    expect(inferLocationFromQuery("사당역 휠체어타고 갈만한 햄버거집 추천좀")).toBe("사당역");
    expect(inferLocationFromQuery("인천 주안에 휠체어 타고 갈만한 분위기 좋은 카페 찾아줘")).toBe("인천 주안");
    expect(inferLocationFromQuery("제주 국제 공항 근처 휠체어 접근 가능한 카페 추천해줘")).toBe("제주 국제 공항");
  });

  it("infers category from concrete target terms", () => {
    expect(inferCategoryFromQuery("사당역 햄버거집 추천", "any")).toBe("restaurant");
    expect(inferCategoryFromQuery("성수동 베이커리 추천", "any")).toBe("cafe");
    expect(inferCategoryFromQuery("강남역 약국 찾아줘", "any")).toBe("any");
    expect(inferCategoryFromQuery("신촌역 영화관 추천", "any")).toBe("culture");
  });

  it("uses the raw query as the source of truth over noisy tool parameters", () => {
    const intent = resolveRecommendSearchIntent(
      {
        query: "사당역 휠체어타고 갈만한 햄버거집 추천좀",
        location: "강남역",
        category: "cafe",
        preferences: ["휠체어", "분위기"]
      },
      { defaultRadiusM: 800, defaultLimit: 5 }
    );

    expect(intent.location).toBe("사당역");
    expect(intent.category).toBe("restaurant");
    expect(intent.contentPreferences).toEqual(["햄버거", "버거"]);
    expect(intent.searchPreferences).toEqual(["햄버거", "버거"]);
  });

  it("treats specific restaurant types in the raw query as hard content filters", () => {
    const intent = resolveRecommendSearchIntent(
      {
        query: "제주 횟집 휠체어 접근 가능",
        location: "제주",
        category: "restaurant"
      },
      { defaultRadiusM: 800, defaultLimit: 5 }
    );

    expect(intent.location).toBe("제주");
    expect(intent.category).toBe("restaurant");
    expect(intent.contentPreferences).toEqual(["횟집", "회", "생선회"]);
    expect(intent.searchPreferences).toEqual(["횟집", "회", "생선회"]);
  });

  it("extracts specific restaurant types from casual Korean query wording", () => {
    const intent = resolveRecommendSearchIntent(
      {
        query: "제주 횟집 추천좀 휠체어 타고 가야해"
      },
      { defaultRadiusM: 800, defaultLimit: 5 }
    );

    expect(intent.location).toBe("제주");
    expect(intent.category).toBe("restaurant");
    expect(intent.contentPreferences).toEqual(["횟집", "회", "생선회"]);
  });

  it("keeps unknown concrete target phrases from the raw query", () => {
    const omakase = resolveRecommendSearchIntent(
      { query: "서울 강남 오마카세 맛집 휠체어 접근 가능" },
      { defaultRadiusM: 800, defaultLimit: 5 }
    );
    const burger = resolveRecommendSearchIntent(
      { query: "인천 주안 수제버거 휠체어 타고 갈만한 곳" },
      { defaultRadiusM: 800, defaultLimit: 5 }
    );
    const dimsum = resolveRecommendSearchIntent(
      { query: "강남 딤섬 맛집 휠체어 접근 가능" },
      { defaultRadiusM: 800, defaultLimit: 5 }
    );

    expect(omakase.location).toBe("서울 강남");
    expect(omakase.category).toBe("restaurant");
    expect(omakase.contentPreferences).toEqual(["오마카세"]);
    expect(burger.location).toBe("인천 주안");
    expect(burger.contentPreferences).toEqual(["수제버거"]);
    expect(dimsum.location).toBe("강남");
    expect(dimsum.contentPreferences).toEqual(["딤섬"]);
  });

  it("does not treat accessibility adjectives as location or content", () => {
    const cafe = resolveRecommendSearchIntent(
      { query: "홍대입구역 근처 휠체어 접근성 용이한 카페 추천해줘" },
      { defaultRadiusM: 800, defaultLimit: 5 }
    );
    const restaurant = resolveRecommendSearchIntent(
      { query: "사당역 근처 휠체어 접근 용이한 식당 추천해줘" },
      { defaultRadiusM: 800, defaultLimit: 5 }
    );

    expect(cafe.location).toBe("홍대입구역");
    expect(cafe.category).toBe("cafe");
    expect(cafe.contentPreferences).toEqual([]);
    expect(restaurant.location).toBe("사당역");
    expect(restaurant.category).toBe("restaurant");
    expect(restaurant.contentPreferences).toEqual([]);
  });

  it("falls back to parsed preferences when a query has no concrete target term", () => {
    const intent = resolveRecommendSearchIntent(
      {
        query: "사당역 근처 휠체어 접근성 좋은 곳 추천해줘",
        location: "사당역",
        category: "restaurant",
        preferences: ["햄버거"]
      },
      { defaultRadiusM: 800, defaultLimit: 5 }
    );

    expect(intent.location).toBe("사당역");
    expect(intent.category).toBe("restaurant");
    expect(intent.contentPreferences).toEqual(["햄버거", "버거"]);
  });
});
