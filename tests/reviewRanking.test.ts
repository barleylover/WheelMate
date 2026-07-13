import { describe, expect, it } from "vitest";
import type { RankedPlace } from "../src/types.js";
import { partitionRankedPlaces, sortRankedPlaces } from "../src/reviewSearch/reviewRanking.js";

function ranked(name: string, grade: RankedPlace["review"]["review_signal_grade"], official: RankedPlace["official_support_grade"], score: number): RankedPlace {
  const positiveSignals = grade === "R1" || grade === "R2"
    ? [{ polarity: "positive" as const, strength: "strong" as const, type: "wheelchair_direct" as const, matched_text: "휠체어 이용 가능" }]
    : [];
  return {
    place: { name, category: "cafe", lat: 0, lng: 0, distance_m: score },
    review: {
      place_name: name,
      queries_used: [],
      review_signal_grade: grade,
      review_signal_score: score,
      positive_signals: positiveSignals,
      negative_signals: [],
      ambiguous_signals: [],
      results: positiveSignals.length > 0
        ? [{
          source: "naver_blog",
          title: name,
          link: "https://example.com",
          snippet: "휠체어 이용 가능",
          date: "20260701",
          place_match_score: 0.9,
          signals: positiveSignals
        }]
        : [],
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

  it("uses the computed ranking score before distance inside the same evidence band", () => {
    const closer = ranked("closer", "R1", "none", 80);
    closer.place.distance_m = 100;
    closer.ranking_score = 580;
    const preferred = ranked("preferred", "R1", "none", 80);
    preferred.place.distance_m = 500;
    preferred.ranking_score = 600;

    expect(sortRankedPlaces([closer, preferred]).map((item) => item.place.name))
      .toEqual(["preferred", "closer"]);
  });

  it("partitions W, weak R3, and default R4 outside recommendations", () => {
    const partitions = partitionRankedPlaces([
      ranked("bad", "W", "none", 10),
      ranked("weak", "R3", "none", 10),
      ranked("unknown", "R4", "none", 10),
      ranked("good", "R1", "none", 10)
    ]);
    expect(partitions.recommendations.map((item) => item.place.name)).toEqual(["good"]);
    expect(partitions.notRecommended.map((item) => item.place.name)).toEqual(["bad"]);
    expect(partitions.unverified.map((item) => item.place.name)).toEqual(["weak", "unknown"]);
  });

  it("does not recommend public-support-only candidates by default", () => {
    const partitions = partitionRankedPlaces([
      ranked("public-only", "R4", "O1", 10),
      ranked("review", "R1", "none", 10)
    ]);

    expect(partitions.recommendations.map((item) => item.place.name)).toEqual(["review"]);
    expect(partitions.unverified.map((item) => item.place.name)).toEqual(["public-only"]);
  });
});
