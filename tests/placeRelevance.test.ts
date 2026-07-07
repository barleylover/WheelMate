import { describe, expect, it } from "vitest";
import { calculatePlaceRelevance } from "../src/reviewSearch/placeRelevance.js";

const context = {
  placeName: "A카페",
  neighborhood: "홍대입구",
  district: "마포구",
  addressToken: "양화로",
  category: "카페"
};

describe("calculatePlaceRelevance", () => {
  it("scores place and neighborhood as usable evidence", () => {
    const score = calculatePlaceRelevance(
      { title: "A카페 홍대입구 방문", snippet: "마포구 양화로 카페 휠체어 후기" },
      context
    );
    expect(score).toBeGreaterThanOrEqual(0.65);
  });

  it("keeps neighborhood-only matches weak", () => {
    const score = calculatePlaceRelevance(
      { title: "홍대입구 카페 후기", snippet: "유모차 가능" },
      context
    );
    expect(score).toBeLessThan(0.45);
  });

  it("discards unrelated places", () => {
    const score = calculatePlaceRelevance({ title: "B식당", snippet: "강남역 계단 있음" }, context);
    expect(score).toBe(0);
  });

  it("matches place names despite spacing differences", () => {
    const score = calculatePlaceRelevance(
      { title: "블랑제리 르팡 휠체어 이용 가능", snippet: "사당역 베이커리 카페" },
      { ...context, placeName: "블랑제리르팡", neighborhood: "사당역" }
    );
    expect(score).toBeGreaterThanOrEqual(0.45);
  });
});
