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

  it("does not treat parking unavailable as wheelchair unavailable", () => {
    const signals = extractSignalsFromText("출입구 휠체어 이용가능 / 주차 불가");
    expect(signals).toContainEqual(
      expect.objectContaining({ polarity: "positive", strength: "strong", type: "wheelchair_direct" })
    );
    expect(signals).not.toContainEqual(
      expect.objectContaining({ polarity: "negative", type: "wheelchair_direct" })
    );
  });

  it("treats stroller as weak positive", () => {
    const signals = extractSignalsFromText("유모차 가능");
    expect(signals).toContainEqual(
      expect.objectContaining({ polarity: "positive", strength: "weak", type: "stroller_proxy" })
    );
  });

  it("keeps floor-only mentions ambiguous", () => {
    const signals = extractSignalsFromText("매장은 1층에 있어요");
    expect(signals).toContainEqual(
      expect.objectContaining({ polarity: "ambiguous", strength: "weak", type: "basement_or_floor" })
    );
  });

  it("extracts broader accessibility wording", () => {
    const signals = extractSignalsFromText("전동휠체어 진입 가능, 턱이 없고 슬로프가 설치되어 있어요.");
    expect(signals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ polarity: "positive", strength: "strong", type: "wheelchair_direct" }),
        expect.objectContaining({ polarity: "positive", strength: "strong", type: "entrance_step" }),
        expect.objectContaining({ polarity: "positive", strength: "strong", type: "ramp" })
      ])
    );
  });

  it("keeps station elevator context ambiguous", () => {
    const signals = extractSignalsFromText("지하철역 엘리베이터가 가까워요");
    expect(signals).toContainEqual(
      expect.objectContaining({ polarity: "ambiguous", strength: "weak", type: "elevator" })
    );
  });

  it("ignores general accessibility wording when it is not about wheelchair access", () => {
    const signals = extractSignalsFromText("역에서 가까워 접근성이 좋고 비 오는 날에도 이동하기 편한 카페");
    expect(signals.some((signal) => signal.polarity === "positive")).toBe(false);
  });

  it("removes html tags and entities", () => {
    expect(sanitizeHtmlText("<b>문턱 없음</b> &amp; 엘리베이터 있음")).toBe("문턱 없음 & 엘리베이터 있음");
  });
});
