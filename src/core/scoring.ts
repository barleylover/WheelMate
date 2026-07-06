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

const facilityBonus = (evidence: AccessibilityEvidence[]): number => {
  let bonus = 0;
  if (hasEvidence(evidence, (item) => item.evidenceType === "bf_certified")) {
    bonus += 20;
  }
  if (hasEvidence(evidence, (item) => item.evidenceType === "disability_facility")) {
    bonus += 20;
  }
  return bonus;
};

const supportBonus = (supportFacilities: SupportFacility[]): number => {
  const restroom = supportFacilities
    .filter((facility) => facility.type === "accessible_restroom" && facility.distanceM !== undefined)
    .sort((a, b) => a.distanceM! - b.distanceM!)[0];
  const charger = supportFacilities
    .filter((facility) => facility.type === "wheelchair_charger" && facility.distanceM !== undefined)
    .sort((a, b) => a.distanceM! - b.distanceM!)[0];

  let bonus = 0;
  if (restroom?.distanceM !== undefined) {
    bonus += restroom.distanceM <= 300 ? 5 : restroom.distanceM <= 800 ? 3 : 0;
  }
  if (charger?.distanceM !== undefined) {
    bonus += charger.distanceM <= 500 ? 5 : 0;
  }
  return bonus;
};

export const determineAccessibilityGrade = (
  evidence: AccessibilityEvidence[],
  supportFacilities: SupportFacility[]
): AccessibilityGrade => {
  if (
    hasEvidence(
      evidence,
      (item) =>
        item.level === "store_level" &&
        ((item.evidenceType === "wheelchair_entrance" && item.value === true) ||
          (item.evidenceType === "osm_wheelchair" && item.value === "yes"))
    )
  ) {
    return "A";
  }

  if (
    hasEvidence(
      evidence,
      (item) =>
        item.level === "building_or_facility_level" &&
        (item.evidenceType === "bf_certified" || item.evidenceType === "disability_facility")
    )
  ) {
    return "B";
  }

  if (supportFacilities.length > 0) {
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

  const score =
    storeLevelBonus(place.evidence) +
    facilityBonus(place.evidence) +
    supportBonus(supportFacilitiesNearby) +
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
