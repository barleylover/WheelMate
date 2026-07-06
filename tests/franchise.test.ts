import { describe, expect, it } from "vitest";
import { hasExcludeFranchiseIntent, isFranchise, shouldExcludeFranchise } from "../src/core/franchise.js";

describe("franchise", () => {
  it("대표 프랜차이즈 이름을 식별한다", () => {
    expect(isFranchise("스타벅스 홍대점")).toBe(true);
    expect(isFranchise("공차 홍대입구역점")).toBe(true);
    expect(isFranchise("메가커피 서교동점")).toBe(true);
  });

  it("개인 매장은 프랜차이즈로 보지 않는다", () => {
    expect(isFranchise("Snow Mounteen")).toBe(false);
    expect(isFranchise("동네 작은 책방카페")).toBe(false);
  });

  it("'프랜차이즈 제외' 의도만 감지하고, 단순 언급은 제외로 보지 않는다", () => {
    expect(hasExcludeFranchiseIntent("프랜차이즈 제외한 카페")).toBe(true);
    expect(hasExcludeFranchiseIntent("체인점 말고 알려줘")).toBe(true);
    expect(hasExcludeFranchiseIntent("프랜차이즈 카페 추천")).toBe(false);
    expect(hasExcludeFranchiseIntent("조용한 카페")).toBe(false);
  });

  it("명시적 exclude_franchise 플래그가 문구 추론보다 우선한다", () => {
    expect(shouldExcludeFranchise({ exclude_franchise: true })).toBe(true);
    expect(shouldExcludeFranchise({ exclude_franchise: false, query: "프랜차이즈 제외" })).toBe(false);
    expect(shouldExcludeFranchise({ query: "프랜차이즈 빼고 강남역 카페" })).toBe(true);
    expect(shouldExcludeFranchise({ preferences: ["프랜차이즈 제외"] })).toBe(true);
    expect(shouldExcludeFranchise({})).toBe(false);
  });
});
