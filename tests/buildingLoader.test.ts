import { describe, expect, it } from "vitest";
import { rowToBuildingAccessibility } from "../src/data/loaders/buildingAccessibilityRawLoader.js";

describe("전국장애인편의시설표준데이터 행 매핑", () => {
  it("한글 컬럼(있음/없음)을 편의시설 플래그로 매핑한다", () => {
    const record = rowToBuildingAccessibility(
      {
        시설명: "테스트 카페",
        소재지도로명주소: "서울 성동구 아차산로 104",
        위도: "37.5446",
        경도: "127.0559",
        주출입구접근로: "있음",
        승강기: "있음",
        장애인사용가능화장실: "있음",
        주출입구높이차이제거: "없음",
        장애인전용주차구역: "있음"
      },
      "전국장애인편의시설표준데이터"
    );

    expect(record).toBeDefined();
    expect(record?.hasEntranceRamp).toBe(true);
    expect(record?.hasElevator).toBe(true);
    expect(record?.hasAccessibleRestroom).toBe(true);
    expect(record?.hasThresholdRemoved).toBe(false); // "없음"
    expect(record?.hasAccessibleParking).toBe(true);
    expect(record?.bfCertified).toBe(false);
    expect(record?.lat).toBeCloseTo(37.5446);
  });

  it("BF 컬럼에 '인증' 등급 문자열이 오면 BF 인증으로 본다", () => {
    const record = rowToBuildingAccessibility(
      { 시설명: "BF 건물", 위도: "37.5", 경도: "127.0", BF인증여부: "인증" },
      "한국장애인개발원"
    );
    expect(record?.bfCertified).toBe(true);
  });

  it("BF 컬럼이 '미인증'/'없음'이면 인증으로 보지 않는다", () => {
    expect(
      rowToBuildingAccessibility(
        { 시설명: "x", 위도: "37.5", 경도: "127.0", BF인증: "미인증" },
        "s"
      )?.bfCertified
    ).toBe(false);
    expect(
      rowToBuildingAccessibility(
        { 시설명: "x", 위도: "37.5", 경도: "127.0", 무장애인증: "없음" },
        "s"
      )?.bfCertified
    ).toBe(false);
  });

  it("markAllBfCertified 로더(BF 전용 데이터)는 컬럼과 무관하게 BF 인증 처리한다", () => {
    const record = rowToBuildingAccessibility(
      { 시설명: "BF 시설", 위도: "37.5", 경도: "127.0" },
      "한국장애인고용공단",
      true
    );
    expect(record?.bfCertified).toBe(true);
  });

  it("좌표나 시설명이 없으면 제외한다(undefined)", () => {
    expect(
      rowToBuildingAccessibility({ 시설명: "이름만", 소재지주소: "서울" }, "s")
    ).toBeUndefined();
    expect(
      rowToBuildingAccessibility({ 위도: "37.5", 경도: "127.0" }, "s")
    ).toBeUndefined();
  });

  it("편의시설 개수 컬럼(장애인화장실 대수=2)도 있음으로 본다", () => {
    const record = rowToBuildingAccessibility(
      { 시설명: "카페", 위도: "37.5", 경도: "127.0", 장애인사용가능화장실: "2" },
      "s"
    );
    expect(record?.hasAccessibleRestroom).toBe(true);
  });
});
