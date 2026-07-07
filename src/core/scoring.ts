import { distanceScore } from "./distance.js";
import type {
  AccessibilityEvidence,
  AccessibilityGrade,
  PlaceCandidate,
  ScoredPlace,
  SupportFacility
} from "./types.js";

const hasEvidence = (
  evidence: AccessibilityEvidence[],
  predicate: (item: AccessibilityEvidence) => boolean
): boolean => evidence.some(predicate);

const storeLevelBonus = (evidence: AccessibilityEvidence[]): number => {
  let bonus = 0;

  if (hasEvidence(evidence, (item) => item.evidenceType === "wheelchair_entrance" && item.value === true)) {
    bonus += 50;
  }
  if (hasEvidence(evidence, (item) => item.evidenceType === "wheelchair_seating" && item.value === true)) {
    bonus += 15;
  }
  if (hasEvidence(evidence, (item) => item.evidenceType === "wheelchair_restroom" && item.value === true)) {
    bonus += 15;
  }
  if (hasEvidence(evidence, (item) => item.evidenceType === "wheelchair_parking" && item.value === true)) {
    bonus += 10;
  }
  if (hasEvidence(evidence, (item) => item.evidenceType === "osm_wheelchair" && item.value === "yes")) {
    bonus += 30;
  }
  if (hasEvidence(evidence, (item) => item.evidenceType === "osm_wheelchair" && item.value === "limited")) {
    bonus += 10;
  }

  return Math.min(bonus, 70);
};

/** 주변 보조 편의시설 가산 반경(m). 건물 내 장애인화장실이 확인되면 화장실 가산은 생략한다. */
export const RESTROOM_NEARBY_RADIUS_M = 500;
export const CHARGER_NEARBY_RADIUS_M = 500;

const WEAK_MATCH_FACTOR = 0.5;

/**
 * 공공데이터(세분화 편의시설 + BF 인증) 근거 점수표.
 * Google/OSM 매장 단위 점수(storeLevelBonus)는 기존 값을 그대로 두고, 이 표는 공공데이터 근거에만 적용한다.
 */
const PUBLIC_DATA_POINTS: Partial<Record<AccessibilityEvidence["evidenceType"], number>> = {
  bf_certified: 30, // 가장 신뢰도 높은 신호
  threshold_removed: 20, // 주출입구 높이차이 제거(턱 없음) — 휠체어에 가장 치명적 요소
  entrance_ramp: 15, // 주출입구 접근로(경사로)
  elevator: 15, // 승강기 (층수 컬럼이 없으면 조건 없이 가산, detail 은 로더에서 "층수 미확인" 표기)
  building_accessible_restroom: 15, // 건물 내 장애인화장실 (주변 화장실 +10 대체, 중복 가산 금지)
  disability_facility: 15 // 세부 컬럼이 없는 장애인편의시설 건물 매칭(레거시 호환)
};

// evidence_type 당 1회만 가산한다. 같은 타입 레코드가 여러 개여도 한 번만 세고,
// 전부 weak 매칭이면 50%만 가산한다(strong 이 하나라도 있으면 full).
const facilityTypePoints = (
  evidence: AccessibilityEvidence[],
  type: AccessibilityEvidence["evidenceType"],
  base: number
): number => {
  const rows = evidence.filter((item) => item.evidenceType === type && Boolean(item.value));
  if (rows.length === 0) {
    return 0;
  }
  const hasStrongMatch = rows.some((item) => item.matchStrength !== "weak");
  return hasStrongMatch ? base : base * WEAK_MATCH_FACTOR;
};

const publicDataFacilityBonus = (evidence: AccessibilityEvidence[]): number => {
  let bonus = 0;
  for (const [type, base] of Object.entries(PUBLIC_DATA_POINTS)) {
    bonus += facilityTypePoints(evidence, type as AccessibilityEvidence["evidenceType"], base);
  }
  return bonus;
};

const nearestByType = (
  supportFacilities: SupportFacility[],
  type: SupportFacility["type"]
): SupportFacility | undefined =>
  supportFacilities
    .filter((facility) => facility.type === type && facility.distanceM !== undefined)
    .sort((a, b) => a.distanceM! - b.distanceM!)[0];

const supportBonus = (supportFacilities: SupportFacility[], suppressRestroom: boolean): number => {
  let bonus = 0;
  if (!suppressRestroom) {
    const restroom = nearestByType(supportFacilities, "accessible_restroom");
    if (restroom?.distanceM !== undefined && restroom.distanceM <= RESTROOM_NEARBY_RADIUS_M) {
      bonus += 10; // 장애인화장실 500m 내
    }
  }
  const charger = nearestByType(supportFacilities, "wheelchair_charger");
  if (charger?.distanceM !== undefined && charger.distanceM <= CHARGER_NEARBY_RADIUS_M) {
    bonus += 10; // 급속충전기 500m 내
  }
  return bonus;
};

/**
 * 등급 판정 우선순위(요청 사양):
 *   A: BF 인증
 *   B: 경사로·승강기·장애인화장실·턱 제거 등 접근 편의 "존재 확인"(매장 내 또는 주변)
 *   C: Google/OSM 으로 휠체어 접근 가능 확인
 *   D: 그 외(충전기만 주변에 있거나 근거 없음)
 * weak 매칭으로 신뢰도가 낮춰진(level=unverified) 근거는 등급을 올리지 않는다.
 */
export const determineAccessibilityGrade = (
  evidence: AccessibilityEvidence[],
  supportFacilities: SupportFacility[]
): AccessibilityGrade => {
  // A: BF 인증(건물·시설 단위 확인, weak 매칭 제외)
  if (
    hasEvidence(
      evidence,
      (item) => item.evidenceType === "bf_certified" && item.level === "building_or_facility_level"
    )
  ) {
    return "A";
  }

  // B: 경사로/승강기/턱 제거/장애인편의시설 등 건물 단위 편의 또는 장애인화장실(매장 내·주변)
  const hasBuildingFeature = hasEvidence(
    evidence,
    (item) =>
      (item.level === "building_or_facility_level" &&
        (item.evidenceType === "entrance_ramp" ||
          item.evidenceType === "threshold_removed" ||
          item.evidenceType === "elevator" ||
          item.evidenceType === "disability_facility" ||
          item.evidenceType === "building_accessible_restroom")) ||
      // 매장 단위로 장애인화장실이 확인된 경우(Google/OSM restroom, weak 매칭 제외)
      (item.level === "store_level" &&
        item.evidenceType === "wheelchair_restroom" &&
        item.value === true)
  );
  const hasNearbyRestroom =
    supportFacilities.some(
      (facility) =>
        facility.type === "accessible_restroom" &&
        facility.distanceM !== undefined &&
        facility.distanceM <= RESTROOM_NEARBY_RADIUS_M
    ) ||
    hasEvidence(
      evidence,
      (item) => item.evidenceType === "accessible_restroom_nearby" && Boolean(item.value)
    );
  if (hasBuildingFeature || hasNearbyRestroom) {
    return "B";
  }

  // C: Google/OSM 매장 단위 휠체어 접근 가능 확인(weak 매칭 제외)
  if (
    hasEvidence(
      evidence,
      (item) =>
        item.level === "store_level" &&
        ((item.evidenceType === "wheelchair_entrance" && item.value === true) ||
          (item.evidenceType === "osm_wheelchair" && item.value === "yes"))
    )
  ) {
    return "C";
  }

  return "D";
};

export const scorePlace = (
  place: PlaceCandidate,
  distanceM: number,
  supportFacilitiesNearby: SupportFacility[] = []
): ScoredPlace => {
  const hasWheelchairNo = hasEvidence(
    place.evidence,
    (item) => item.evidenceType === "osm_wheelchair" && item.value === "no" && item.level === "store_level"
  );

  if (hasWheelchairNo) {
    return {
      place,
      distanceM,
      score: 0,
      grade: "D",
      excluded: true,
      supportFacilitiesNearby
    };
  }

  const hasBuildingRestroom = hasEvidence(
    place.evidence,
    (item) => item.evidenceType === "building_accessible_restroom" && Boolean(item.value)
  );

  const score =
    storeLevelBonus(place.evidence) +
    publicDataFacilityBonus(place.evidence) +
    supportBonus(supportFacilitiesNearby, hasBuildingRestroom) +
    distanceScore(distanceM);

  return {
    place,
    distanceM,
    score,
    grade: determineAccessibilityGrade(place.evidence, supportFacilitiesNearby),
    excluded: false,
    supportFacilitiesNearby
  };
};
