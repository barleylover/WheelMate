import { describe, expect, it } from "vitest";
import { buildReviewQueries, splitPreferences } from "../src/reviewSearch/queryBuilder.js";

describe("buildReviewQueries", () => {
  it("creates three default queries with place and neighborhood", () => {
    const queries = buildReviewQueries({
      placeName: "A카페",
      neighborhood: "홍대입구",
      district: "마포구",
      category: "카페"
    });

    expect(queries).toHaveLength(3);
    expect(queries[0]).toContain("A카페");
    expect(queries[0]).toContain("홍대입구");
  });

  it("prioritizes entrance and restroom preferences", () => {
    const queries = buildReviewQueries({
      placeName: "A카페",
      neighborhood: "성수동",
      preferences: ["입구중요", "장애인화장실"]
    });

    expect(queries[0]).toContain("문턱 경사로 계단");
    expect(queries[1]).toContain("장애인 화장실");
  });

  it("separates unsupported quiet preference", () => {
    expect(splitPreferences(["조용한", "엘리베이터"])).toEqual({
      supported: ["엘리베이터"],
      unsupported: ["조용한"]
    });
  });
});
