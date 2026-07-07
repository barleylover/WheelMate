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
