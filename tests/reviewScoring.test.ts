import { describe, expect, it } from "vitest";
import type { ReviewEvidence } from "../src/types.js";
import { scoreReviewEvidence } from "../src/reviewSearch/signalScoring.js";

function evidence(signal: ReviewEvidence["signals"][number], source: ReviewEvidence["source"] = "naver_blog"): ReviewEvidence {
  return {
    source,
    title: "A카페",
    link: "https://example.com",
    snippet: signal.matched_text,
    date: "20260701",
    place_match_score: 0.9,
    signals: [signal]
  };
}

describe("scoreReviewEvidence", () => {
  it("grades strong direct positive as R1", () => {
    const result = scoreReviewEvidence([
      evidence({ polarity: "positive", strength: "strong", type: "wheelchair_direct", matched_text: "휠체어 출입 가능" })
    ]);
    expect(result.grade).toBe("R1");
    expect(result.score).toBeGreaterThan(0);
  });

  it("grades weak positive as R2", () => {
    const result = scoreReviewEvidence([
      evidence({ polarity: "positive", strength: "weak", type: "stroller_proxy", matched_text: "유모차 가능" })
    ]);
    expect(result.grade).toBe("R2");
  });

  it("does not grade floor-only mentions as a positive recommendation", () => {
    const result = scoreReviewEvidence([
      evidence({ polarity: "ambiguous", strength: "weak", type: "basement_or_floor", matched_text: "1층" })
    ]);
    expect(result.grade).toBe("R3");
  });

  it("grades ambiguous-only as R3 and no signals as R4", () => {
    expect(
      scoreReviewEvidence([
        evidence({ polarity: "ambiguous", strength: "weak", type: "stairs", matched_text: "계단" })
      ]).grade
    ).toBe("R3");
    expect(scoreReviewEvidence([]).grade).toBe("R4");
  });

  it("grades strong negative as W and clamps score", () => {
    const result = scoreReviewEvidence([
      evidence({ polarity: "negative", strength: "strong", type: "stairs", matched_text: "계단 올라가야" })
    ]);
    expect(result.grade).toBe("W");
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(99);
  });

  it("does not recommend from a known positive report older than five years", () => {
    const stale = evidence({
      polarity: "positive",
      strength: "strong",
      type: "wheelchair_direct",
      matched_text: "휠체어 출입 가능"
    });
    stale.date = "20150101";

    const result = scoreReviewEvidence([stale]);
    expect(result.grade).toBe("R4");
    expect(result.positive).toEqual([]);
  });
});
