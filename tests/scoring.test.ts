import { describe, expect, it } from "vitest";
import { determineAccessibilityGrade, scorePlace } from "../src/core/scoring.js";
import type { AccessibilityEvidence, PlaceCandidate, SupportFacility } from "../src/core/types.js";

const candidate = (evidence: AccessibilityEvidence[]): PlaceCandidate => ({
  id: "test:1",
  name: "테스트 카페",
  category: "cafe",
  address: "서울시 마포구",
  lat: 37.557,
  lng: 126.925,
  source: "test",
  evidence
});

const evidence = (
  source: string,
  evidenceType: AccessibilityEvidence["evidenceType"],
  value: AccessibilityEvidence["value"],
  level: AccessibilityEvidence["level"] = "store_level",
  matchStrength?: AccessibilityEvidence["matchStrength"]
): AccessibilityEvidence => ({
  source,
  level,
  evidenceType,
  value,
  detail: `${evidenceType}=${value}`,
  confidence: 0.8,
  ...(matchStrength ? { matchStrength } : {})
});

const buildingEvidence = (
  evidenceType: AccessibilityEvidence["evidenceType"],
  matchStrength?: AccessibilityEvidence["matchStrength"]
): AccessibilityEvidence => evidence("전국장애인편의시설표준데이터", evidenceType, true, "building_or_facility_level", matchStrength);

const restroom = (distanceM: number): SupportFacility => ({
  type: "accessible_restroom",
  name: "장애인 화장실",
  lat: 37.5571,
  lng: 126.9251,
  source: "전국공중화장실표준데이터",
  distanceM
});

const charger = (distanceM: number): SupportFacility => ({
  type: "wheelchair_charger",
  name: "급속충전기",
  lat: 37.5571,
  lng: 126.9251,
  source: "전동휠체어급속충전기",
  distanceM
});

// 거리 점수(distanceScore)를 0으로 두어(1200m 초과) 편의시설 점수만 격리 검증한다.
const FAR = 2000;

describe("scoring: 공공데이터 세부 편의시설 점수표 (v2)", () => {
  it("Google wheelchairAccessibleEntrance=true 는 A 등급, 매장 단위 점수는 유지된다", () => {
    const result = scorePlace(candidate([evidence("Google Places", "wheelchair_entrance", true)]), 250);
    expect(result.grade).toBe("A");
    expect(result.score).toBeGreaterThanOrEqual(70);
  });

  it("OSM wheelchair=no 는 추천에서 제외한다", () => {
    const result = scorePlace(candidate([evidence("OSM", "osm_wheelchair", "no")]), 200);
    expect(result.excluded).toBe(true);
    expect(result.grade).toBe("D");
  });

  it("BF 인증만 있으면 +30, B 등급", () => {
    const result = scorePlace(candidate([buildingEvidence("bf_certified")]), FAR);
    expect(result.score).toBe(30);
    expect(result.grade).toBe("B");
  });

  it("주출입구 높이차이 제거(턱 없음)는 +20", () => {
    const result = scorePlace(candidate([buildingEvidence("threshold_removed")]), FAR);
    expect(result.score).toBe(20);
    expect(result.grade).toBe("B");
  });

  it("주출입구 접근로(경사로)는 +15, 승강기도 +15", () => {
    expect(scorePlace(candidate([buildingEvidence("entrance_ramp")]), FAR).score).toBe(15);
    expect(scorePlace(candidate([buildingEvidence("elevator")]), FAR).score).toBe(15);
  });

  it("건물 내 장애인화장실은 +15이고, 이때 주변 화장실 +10 은 중복 가산하지 않는다", () => {
    const result = scorePlace(
      candidate([buildingEvidence("building_accessible_restroom")]),
      FAR,
      [restroom(300)]
    );
    expect(result.score).toBe(15); // 건물 내 15 + 주변 화장실 0(중복 금지)
  });

  it("건물 내 장애인화장실이 있어도 급속충전기 500m 내 +10 은 별개로 가산된다", () => {
    const result = scorePlace(
      candidate([buildingEvidence("building_accessible_restroom")]),
      FAR,
      [restroom(300), charger(300)]
    );
    expect(result.score).toBe(25); // 건물 화장실 15 + 충전기 10
  });

  it("건물 내 화장실 근거가 없으면 주변 장애인화장실 500m 내 +10 을 가산한다", () => {
    const result = scorePlace(candidate([]), FAR, [restroom(300)]);
    expect(result.score).toBe(10);
    expect(result.grade).toBe("C");
  });

  it("weak 매칭 근거는 점수의 50%만 가산한다 (BF weak → +15)", () => {
    const result = scorePlace(
      candidate([evidence("BF 인증", "bf_certified", true, "unverified", "weak")]),
      FAR
    );
    expect(result.score).toBe(15);
  });

  it("같은 evidence_type 이 여러 레코드여도 1회만 가산한다", () => {
    const result = scorePlace(
      candidate([
        buildingEvidence("disability_facility"),
        evidence(
          "한국사회보장정보원_장애인편의시설 현황",
          "disability_facility",
          true,
          "building_or_facility_level"
        )
      ]),
      FAR
    );
    expect(result.score).toBe(15); // 30 아님(중복 가산 금지)
    expect(result.grade).toBe("B");
  });

  it("정보 없음 항목은 0점 처리하고 감점하지 않는다", () => {
    const result = scorePlace(candidate([]), FAR);
    expect(result.score).toBe(0);
    expect(result.excluded).toBe(false);
    expect(result.grade).toBe("D");
  });

  it("weak/unverified 로 낮춰진 매장 근거는 A 등급으로 올리지 않는다", () => {
    const grade = determineAccessibilityGrade(
      [evidence("Google Places", "wheelchair_entrance", true, "unverified")],
      []
    );
    expect(grade).toBe("D");
  });
});
