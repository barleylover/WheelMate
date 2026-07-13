import { describe, expect, it } from "vitest";
import { buildReviewQueries, splitPreferences } from "../src/reviewSearch/queryBuilder.js";

describe("buildReviewQueries", () => {
  it("creates five default queries with place and neighborhood", () => {
    const queries = buildReviewQueries({
      placeName: "A카페",
      neighborhood: "홍대입구",
      district: "마포구",
      category: "카페"
    });

    expect(queries).toHaveLength(5);
    expect(queries[0]).toContain("A카페");
    expect(queries[0]).toContain("홍대입구");
    expect(queries.join(" ")).toContain("문턱");
    expect(queries.join(" ")).toContain("장애인 편의시설");
  });

  it("does not repeat a station already present in the branch name", () => {
    const queries = buildReviewQueries({
      placeName: "메가MGC커피 잠실지하상가점",
      neighborhood: "잠실역",
      district: "송파구",
      category: "카페"
    }, 3);

    expect(queries).toEqual([
      "메가MGC커피 잠실지하상가점 잠실역 휠체어",
      "메가MGC커피 잠실지하상가점 잠실역 장애인 편의시설",
      "메가MGC커피 잠실지하상가점 잠실역 휠체어 이용 가능"
    ]);
  });

  it("omits an exactly repeated station token from a branch query", () => {
    const queries = buildReviewQueries({
      placeName: "떼루와 잠실역점",
      neighborhood: "잠실역"
    }, 2);

    expect(queries).toEqual([
      "떼루와 잠실역점 휠체어",
      "떼루와 잠실역점 장애인 편의시설"
    ]);
  });

  it("prioritizes entrance and restroom preferences", () => {
    const queries = buildReviewQueries({
      placeName: "A카페",
      neighborhood: "성수동",
      preferences: ["입구중요", "장애인화장실"]
    });

    expect(queries[0]).toContain("휠체어");
    expect(queries[1]).toContain("문턱 경사로 계단");
    expect(queries[2]).toContain("장애인 화장실");
  });

  it("separates unsupported quiet preference", () => {
    expect(splitPreferences(["조용한", "엘리베이터"])).toEqual({
      supported: ["엘리베이터"],
      unsupported: ["조용한"]
    });
  });
});
