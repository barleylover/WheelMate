import { describe, expect, it } from "vitest";
import { buildBalancedSearchCalls, logicalSearchCallLimit } from "../src/search/searchCallPlanner.js";
import type { SearchSource } from "../src/types.js";

const sources: SearchSource[] = [
  "naver_blog", "naver_cafe", "naver_web", "daum_blog", "daum_cafe", "daum_web"
];

describe("balanced search call planner", () => {
  it("spends a four-call budget on two wordings across two providers", () => {
    expect(buildBalancedSearchCalls(["장소 휠체어", "장소 문턱 경사로"], sources, 4)).toEqual([
      { query: "장소 휠체어", source: "naver_blog" },
      { query: "장소 휠체어", source: "daum_blog" },
      { query: "장소 문턱 경사로", source: "naver_blog" },
      { query: "장소 문턱 경사로", source: "daum_blog" }
    ]);
  });

  it("adds web breadth only after blog provider and query diversity", () => {
    const calls = buildBalancedSearchCalls(["q1", "q2"], sources, 6);
    expect(calls.slice(4)).toEqual([
      { query: "q1", source: "naver_web" },
      { query: "q1", source: "daum_web" }
    ]);
  });

  it("keeps web breadth in a six-call plan even when more query variants exist", () => {
    expect(buildBalancedSearchCalls(["q1", "q2", "q3"], sources, 6)).toEqual([
      { query: "q1", source: "naver_blog" },
      { query: "q1", source: "daum_blog" },
      { query: "q2", source: "naver_blog" },
      { query: "q2", source: "daum_blog" },
      { query: "q1", source: "naver_web" },
      { query: "q1", source: "daum_web" }
    ]);
  });

  it("reserves actual-call capacity for retries", () => {
    expect(logicalSearchCallLimit(8, 8)).toBe(6);
    expect(logicalSearchCallLimit(5, 5)).toBe(4);
    expect(logicalSearchCallLimit(3, 3)).toBe(3);
    expect(logicalSearchCallLimit(8)).toBe(8);
  });

  it("deduplicates queries and respects disabled sources", () => {
    expect(buildBalancedSearchCalls(["q1", " q1 "], ["daum_blog"], 10)).toEqual([
      { query: "q1", source: "daum_blog" }
    ]);
  });
});
