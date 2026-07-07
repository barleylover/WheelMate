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
    expect(inferLocationFromQuery("휠체어 타고 갈 수 있는 사당역 횟집 추천좀")).toBe("사당역");
    expect(inferLocationFromQuery("휠체어로 갈 수 있는 홍대입구역 카페 추천")).toBe("홍대입구역");
    expect(inferLocationFromQuery("휠체어 타고 가기 편한 잠실역 근처 카페")).toBe("잠실역");
    expect(inferLocationFromQuery("인천 주안에 휠체어 타고 갈만한 분위기 좋은 카페 찾아줘")).toBe("인천 주안");
    expect(inferLocationFromQuery("제주 국제 공항 근처 휠체어 접근 가능한 카페 추천해줘")).toBe("제주 국제 공항");
    expect(inferLocationFromQuery("전주 한옥 마을 근처 휠체어 접근 가능한 카페 추천해줘")).toBe("전주 한옥 마을");
  });

  it("infers category from concrete target terms", () => {
    expect(inferCategoryFromQuery("사당역 햄버거집 추천", "any")).toBe("restaurant");
    expect(inferCategoryFromQuery("성수동 베이커리 추천", "any")).toBe("cafe");
    expect(inferCategoryFromQuery("강남역 약국 찾아줘", "any")).toBe("any");
    expect(inferCategoryFromQuery("신촌역 영화관 추천", "any")).toBe("culture");
  });

  it("uses explicit structured location and category over noisy query parsing", () => {
    const intent = resolveRecommendSearchIntent(
      {
        query: "사당역 휠체어타고 갈만한 햄버거집 추천좀",
        location: "강남역",
        category: "cafe",
        preferences: ["햄버거"]
      },
      { defaultRadiusM: 800, defaultLimit: 5 }
    );

    expect(intent.location).toBe("강남역");
    expect(intent.category).toBe("cafe");
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

  it("keeps the requested station clean when wheelchair wording precedes it", () => {
    const intent = resolveRecommendSearchIntent(
      {
        query: "휠체어 타고 갈 수 있는 사당역 횟집 추천",
        location: "사당역",
        category: "restaurant",
        preferences: ["횟집"]
      },
      { defaultRadiusM: 800, defaultLimit: 5 }
    );

    expect(intent.location).toBe("사당역");
    expect(intent.category).toBe("restaurant");
    expect(intent.contentPreferences).toEqual(["횟집", "회", "생선회"]);
  });

  it("does not attach trailing action wording to concrete food terms", () => {
    const intent = resolveRecommendSearchIntent(
      {
        query: "사당역 햄버거집 추천해줘. 휠체어 타고 가기 용이해야 해",
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

  it("does not turn location plus category into a fake concrete target", () => {
    const intent = resolveRecommendSearchIntent(
      {
        query: "휠체어 타고 가기 편한 잠실역 근처 카페",
        location: "잠실역",
        category: "cafe"
      },
      { defaultRadiusM: 800, defaultLimit: 5 }
    );

    expect(intent.location).toBe("잠실역");
    expect(intent.category).toBe("cafe");
    expect(intent.contentPreferences).toEqual([]);
  });

  it("keeps generic category queries unfiltered when structured fields are present", () => {
    const cases = [
      {
        query: "휠체어 타고 가기 편한 잠실역 근처 카페",
        location: "잠실역",
        category: "cafe" as const
      },
      {
        query: "홍대입구역 근처에서 휠체어 접근성 좋은 카페 추천",
        location: "홍대입구역",
        category: "cafe" as const
      },
      {
        query: "사당역 근처 휠체어 타고 갈만한 음식점 추천",
        location: "사당역",
        category: "restaurant" as const
      },
      {
        query: "사당역 맛집 추천해줘. 휠체어 타고 갈거야",
        location: "사당역",
        category: "restaurant" as const
      },
      {
        query: "잠실역 카페 추천해줘. 휠체어 접근 좋은 곳으로",
        location: "잠실역",
        category: "cafe" as const
      },
      {
        query: "전주 한옥 마을 주변 휠체어 가능한 카페",
        location: "전주 한옥 마을",
        category: "cafe" as const
      }
    ];

    for (const item of cases) {
      const intent = resolveRecommendSearchIntent(
        item,
        { defaultRadiusM: 800, defaultLimit: 5 }
      );

      expect(intent.location).toBe(item.location);
      expect(intent.category).toBe(item.category);
      expect(intent.contentPreferences).toEqual([]);
      expect(intent.searchPreferences).toEqual([]);
    }
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

  it("handles creative location and target edge cases without polluting location", () => {
    const cases = [
      {
        query: "연남동 비건 브런치 휠체어로 갈 수 있는 곳",
        location: "연남동",
        category: "cafe",
        content: ["비건", "채식", "브런치"]
      },
      {
        query: "서울숲 근처 반려동물 동반 카페 휠체어 가능",
        location: "서울숲",
        category: "cafe",
        content: ["반려동물동반카페"]
      },
      {
        query: "제주공항 근처 아기랑 가기 좋은 베이커리 휠체어",
        location: "제주공항",
        category: "cafe",
        content: ["베이커리", "빵집"]
      },
      {
        query: "을지로 루프탑 술집 휠체어 괜찮은 데",
        location: "을지로",
        category: "restaurant",
        content: ["루프탑술집"]
      },
      {
        query: "대학로 연극 휠체어 좌석",
        location: "대학로",
        category: "culture",
        content: ["연극"]
      },
      {
        query: "여의도 IFC몰 휠체어 접근 가능한 디저트카페",
        location: "여의도 IFC몰",
        category: "cafe",
        content: ["디저트"]
      },
      {
        query: "판교 현대백화점 유모차랑 휠체어 가능한 카페",
        location: "판교 현대백화점",
        category: "cafe",
        content: []
      },
      {
        query: "인사동 전통찻집 휠체어 접근 가능한 곳",
        location: "인사동",
        category: "cafe",
        content: ["전통찻집"]
      },
      {
        query: "서울대입구역 혼밥 가능한 돈까스 휠체어",
        location: "서울대입구역",
        category: "restaurant",
        content: ["돈까스", "돈가스"]
      }
    ];

    for (const item of cases) {
      const intent = resolveRecommendSearchIntent(
        { query: item.query },
        { defaultRadiusM: 800, defaultLimit: 5 }
      );
      expect(intent.location).toBe(item.location);
      expect(intent.category).toBe(item.category);
      expect(intent.contentPreferences).toEqual(item.content);
    }
  });

  it("uses the clause after '말고' as the concrete target", () => {
    const bookstore = resolveRecommendSearchIntent(
      { query: "홍대입구역 카페 말고 조용한 서점 휠체어" },
      { defaultRadiusM: 800, defaultLimit: 5 }
    );
    const riceNoodles = resolveRecommendSearchIntent(
      { query: "수원 행궁동 파스타 말고 쌀국수 휠체어" },
      { defaultRadiusM: 800, defaultLimit: 5 }
    );

    expect(bookstore.location).toBe("홍대입구역");
    expect(bookstore.category).toBe("any");
    expect(bookstore.contentPreferences).toEqual(["서점"]);
    expect(riceNoodles.location).toBe("수원 행궁동");
    expect(riceNoodles.category).toBe("restaurant");
    expect(riceNoodles.contentPreferences).toEqual(["쌀국수", "베트남"]);
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
