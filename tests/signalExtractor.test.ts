import { describe, expect, it } from "vitest";
import { extractSignalsFromText } from "../src/reviewSearch/signalExtractor.js";
import { sanitizeHtmlText } from "../src/reviewSearch/htmlSanitizer.js";

describe("extractSignalsFromText", () => {
  it("extracts strong positive wheelchair and entrance signals", () => {
    const signals = extractSignalsFromText("휠체어 출입 가능하고 문턱 없음. 계단 없이 들어가요.");
    expect(signals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ polarity: "positive", strength: "strong", type: "wheelchair_direct" }),
        expect.objectContaining({ polarity: "positive", strength: "strong", type: "entrance_step" }),
        expect.objectContaining({ polarity: "positive", strength: "strong", type: "stairs" })
      ])
    );
  });

  it("extracts strong negative stair and elevator signals", () => {
    const signals = extractSignalsFromText("계단 올라가야 하고 엘리베이터 없음");
    expect(signals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ polarity: "negative", strength: "strong", type: "stairs" }),
        expect.objectContaining({ polarity: "negative", strength: "strong", type: "elevator" })
      ])
    );
  });

  it("treats stroller as weak positive", () => {
    const signals = extractSignalsFromText("유모차 가능");
    expect(signals).toContainEqual(
      expect.objectContaining({ polarity: "positive", strength: "weak", type: "stroller_proxy" })
    );
  });

  it("keeps station elevator context ambiguous", () => {
    const signals = extractSignalsFromText("지하철역 엘리베이터가 가까워요");
    expect(signals).toContainEqual(
      expect.objectContaining({ polarity: "ambiguous", strength: "weak", type: "elevator" })
    );
  });

  it("removes html tags and entities", () => {
    expect(sanitizeHtmlText("<b>문턱 없음</b> &amp; 엘리베이터 있음")).toBe("문턱 없음 & 엘리베이터 있음");
  });
});
