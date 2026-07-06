import { describe, expect, it } from "vitest";
import { shouldUseGoogleFallback } from "../src/core/googleFallback.js";
import type { AccessibilityGrade } from "../src/core/types.js";

describe("shouldUseGoogleFallback", () => {
  it("fallbackOnly=false 이면 항상 Google 을 호출한다", () => {
    expect(shouldUseGoogleFallback(["A"], false)).toBe(true);
    expect(shouldUseGoogleFallback([], false)).toBe(true);
  });

  it("로컬 후보가 없으면 fallback 으로 Google 을 호출한다", () => {
    expect(shouldUseGoogleFallback([], true)).toBe(true);
  });

  it("로컬 상위 후보에 A/B 등급 근거가 있으면 유료 API 를 호출하지 않는다", () => {
    const grades: AccessibilityGrade[] = ["B", "C", "D"];
    expect(shouldUseGoogleFallback(grades, true)).toBe(false);
  });

  it("로컬 상위 후보가 C/D 뿐이면 fallback 으로 Google 을 호출한다", () => {
    const grades: AccessibilityGrade[] = ["C", "D", "D"];
    expect(shouldUseGoogleFallback(grades, true)).toBe(true);
  });
});
