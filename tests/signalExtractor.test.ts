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

  it("treats an explicit wheelchair visit-possible statement as direct evidence", () => {
    const signals = extractSignalsFromText("가게 옆문을 열어주셔서 휠체어 방문 가능한 제주시 맛집이다");
    expect(signals).toContainEqual(
      expect.objectContaining({
        polarity: "positive",
        strength: "strong",
        type: "wheelchair_direct",
        subject: "venue"
      })
    );
  });

  it("keeps station elevator context ambiguous", () => {
    const signals = extractSignalsFromText("지하철역 엘리베이터가 가까워요");
    expect(signals).toContainEqual(
      expect.objectContaining({ polarity: "ambiguous", strength: "weak", type: "elevator" })
    );
  });

  it("does not treat transit accessibility as venue accessibility", () => {
    const signals = extractSignalsFromText("휠체어 지하철 접근 가능");

    expect(signals.some((signal) => signal.polarity === "positive")).toBe(false);
    expect(signals).toContainEqual(
      expect.objectContaining({ polarity: "ambiguous", strength: "weak", type: "unknown" })
    );
  });

  it("keeps explicit venue accessibility positive near transit wording", () => {
    const signals = extractSignalsFromText("지하철역 근처 식당이며 매장 출입구는 휠체어 이용 가능");

    expect(signals).toContainEqual(
      expect.objectContaining({ polarity: "positive", strength: "strong", type: "wheelchair_direct" })
    );
  });

  it("does not let a later transit sentence erase an earlier venue entrance statement", () => {
    const signals = extractSignalsFromText(
      "1층에 위치하고 있어 휠체어 출입 이 가능함. 휠체어 지하철 접근 가능 지역이다."
    );

    expect(signals).toContainEqual(
      expect.objectContaining({
        polarity: "positive",
        strength: "strong",
        type: "wheelchair_direct",
        subject: "venue"
      })
    );
    expect(signals).toContainEqual(
      expect.objectContaining({ polarity: "ambiguous", subject: "transit" })
    );
  });

  it("ignores general accessibility wording when it is not about wheelchair access", () => {
    const signals = extractSignalsFromText("역에서 가까워 접근성이 좋고 비 오는 날에도 이동하기 편한 카페");
    expect(signals.some((signal) => signal.polarity === "positive")).toBe(false);
  });

  it("removes html tags and entities", () => {
    expect(sanitizeHtmlText("<b>문턱 없음</b> &amp; 엘리베이터 있음")).toBe("문턱 없음 & 엘리베이터 있음");
  });

  it("does not promote explicitly negated accessibility claims", () => {
    for (const text of ["이 카페는 배리어프리 시설이 아닙니다", "휠체어 이용 가능하지 않습니다"]) {
      const signals = extractSignalsFromText(text);
      expect(signals.some((signal) => signal.polarity === "positive")).toBe(false);
      expect(signals).toContainEqual(
        expect.objectContaining({ polarity: "negative", strength: "strong", type: "wheelchair_direct" })
      );
    }
  });

  it("does not add a generic stair caution for the same explicit no-stairs phrase", () => {
    const signals = extractSignalsFromText("계단이 없는 매장입니다");
    expect(signals).toContainEqual(
      expect.objectContaining({ polarity: "positive", strength: "strong", type: "stairs" })
    );
    expect(signals).not.toContainEqual(
      expect.objectContaining({ polarity: "ambiguous", type: "stairs" })
    );
  });

  it("leaves invalid numeric HTML entities untouched instead of throwing", () => {
    expect(sanitizeHtmlText("문턱 없음 &#99999999;")).toBe("문턱 없음 &#99999999;");
  });
});
