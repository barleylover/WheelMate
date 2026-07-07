import { describe, expect, it } from "vitest";
import { contentSearchPreferences } from "../src/mcp/tools/recommendAccessiblePlacesByReviewSearch.js";

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
});
