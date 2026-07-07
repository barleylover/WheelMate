import { describe, expect, it } from "vitest";
import { decodeCsvBuffer } from "../src/data/loaders/fileLoaderUtils.js";

describe("decodeCsvBuffer", () => {
  it("decodes Korean public-data CSV files encoded as CP949/EUC-KR", () => {
    const cp949Hex =
      "c8adc0e5bdc7b8ed2cbcd2c0e7c1f6b5b5b7ceb8edc1d6bcd20abdd3c1f6b1e62cbcadbfefc6afbab0bdc320c1beb7ceb1b820c0cebbe7b5bfb1e62034340a";
    const decoded = decodeCsvBuffer(Buffer.from(cp949Hex, "hex"));

    expect(decoded).toContain("화장실명,소재지도로명주소");
    expect(decoded).toContain("쌈지길,서울특별시 종로구 인사동길 44");
    expect(decoded).not.toContain("\uFFFD");
  });
});
