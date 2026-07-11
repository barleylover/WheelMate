import { describe, expect, it } from "vitest";
import { hasPositiveNumericField } from "../src/data/loaders/fileLoaderUtils.js";

describe("public support-data filters", () => {
  it("distinguishes a generic public restroom from one with accessible fixtures", () => {
    const fields = [
      "남성용-장애인용대변기수",
      "남성용-장애인용소변기수",
      "여성용-장애인용대변기수"
    ];

    expect(hasPositiveNumericField({
      "남성용-장애인용대변기수": "0",
      "남성용-장애인용소변기수": "0",
      "여성용-장애인용대변기수": "0"
    }, fields)).toBe(false);
    expect(hasPositiveNumericField({ "여성용-장애인용대변기수": "1" }, fields)).toBe(true);
  });

  it("rejects zero-capacity charger rows", () => {
    expect(hasPositiveNumericField({ 동시사용가능대수: "0" }, ["동시사용가능대수"])).toBe(false);
    expect(hasPositiveNumericField({ 동시사용가능대수: "02" }, ["동시사용가능대수"])).toBe(true);
  });
});
