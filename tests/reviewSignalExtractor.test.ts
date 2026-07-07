import { describe, expect, it } from "vitest";
import { extractSignalsFromText } from "../src/reviewSearch/signalExtractor.js";

describe("extractSignalsFromText", () => {
  it("recognizes blog-style wheelchair availability phrases", () => {
    const signals = extractSignalsFromText(
      "좌석 휠체어 이용가능. 가게 내부 휠체어 사용 O. 엘베있어 유모차, 휠체어도 오기 편한 카페입니다."
    );

    expect(signals.some((signal) => signal.polarity === "positive" && signal.type === "wheelchair_direct")).toBe(true);
    expect(signals.some((signal) => signal.polarity === "positive" && signal.type === "elevator")).toBe(true);
  });

  it("keeps partial ordering barriers from overriding clear store-use evidence", () => {
    const signals = extractSignalsFromText(
      "메인 주문 카운터는 휠체어로는 진입이 어렵지만, 휠체어 이용 손님도 오셔서 매장 이용 잘 하시더라구요."
    );

    expect(signals.some((signal) => signal.polarity === "positive" && signal.type === "wheelchair_direct")).toBe(true);
    expect(signals.some((signal) => signal.polarity === "negative" && signal.type === "wheelchair_direct")).toBe(false);
  });

  it("does not treat inconvenience as a positive comfort signal", () => {
    const signals = extractSignalsFromText("휠체어 이동 시에는 조금 불편해 보였습니다.");

    expect(signals.some((signal) => signal.polarity === "positive")).toBe(false);
    expect(signals.some((signal) => signal.polarity === "ambiguous" && signal.type === "wheelchair_direct")).toBe(true);
  });

  it("recognizes Jeju restaurant accessibility phrases", () => {
    const signals = extractSignalsFromText(
      "경사로가 있어 휠체어로 편하게 접근할 수 있습니다. 휠체어를 타신 분들도 무리없이 식사를 할 수있는 곳이라고 해요."
    );

    expect(signals.some((signal) => signal.polarity === "positive" && signal.type === "ramp")).toBe(true);
    expect(signals.some((signal) => signal.polarity === "positive" && signal.type === "wheelchair_direct")).toBe(true);
    expect(signals.some((signal) => signal.polarity === "negative" && signal.type === "wheelchair_direct")).toBe(false);
  });

  it("recognizes particle-heavy wheelchair availability phrases", () => {
    const signals = extractSignalsFromText("휠체어 도 사용 가능하고 휠체어 진입도 가능한 울릉도 식당입니다.");

    expect(signals.some((signal) => signal.polarity === "positive" && signal.type === "wheelchair_direct")).toBe(true);
  });
});
