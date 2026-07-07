import { describe, expect, it } from "vitest";
import type { RankedPlace } from "../src/types.js";
import { partitionRankedPlaces, sortRankedPlaces } from "../src/reviewSearch/reviewRanking.js";

function ranked(name: string, grade: RankedPlace["review"]["review_signal_grade"], official: RankedPlace["official_support_grade"], score: number): RankedPlace {
  return {
    place: { name, category: "cafe", lat: 0, lng: 0, distance_m: score },
    review: {
      place_name: name,
      queries_used: [],
      review_signal_grade: grade,
      review_signal_score: score,
      positive_signals: [],
      negative_signals: [],
      ambiguous_signals: [],
      results: [],
      searched_sources: [],
      source_counts: { naver_blog: 0, naver_cafe: 0, naver_web: 0, daum_blog: 0, daum_cafe: 0, daum_web: 0 },
      unavailable_sources: {},
      cautions: [],
      attribution: []
    },
    official_support_grade: official,
    recommendation_status: grade === "W" ? "not_recommended" : "review_positive",
    ranking_score: score,
    official_support_score: 0,
    public_support_evidence: [],
    support_facilities_nearby: []
  };
}

describe("review ranking", () => {
  it("keeps R1 before R2 and O1 after R2 before R3", () => {
    const sorted = sortRankedPlaces([
      ranked("r3", "R3", "none", 99),
      ranked("o1", "R4", "O1", 10),
      ranked("r2", "R2", "none", 1),
      ranked("r1", "R1", "none", 0)
    ]);
    expect(sorted.map((item) => item.place.name)).toEqual(["r1", "r2", "o1", "r3"]);
  });

  it("partitions W and default R4 outside recommendations", () => {
    const partitions = partitionRankedPlaces([
      ranked("bad", "W", "none", 10),
      ranked("unknown", "R4", "none", 10),
      ranked("good", "R1", "none", 10)
    ]);
    expect(partitions.recommendations.map((item) => item.place.name)).toEqual(["good"]);
    expect(partitions.notRecommended.map((item) => item.place.name)).toEqual(["bad"]);
    expect(partitions.unverified.map((item) => item.place.name)).toEqual(["unknown"]);
  });
});
