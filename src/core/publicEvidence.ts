import type { OfficialSupportGrade, PublicSupportEvidence, SupportFacility } from "../types.js";

export function supportEvidenceFromFacilities(facilities: SupportFacility[]): PublicSupportEvidence[] {
  return facilities.map((facility) => ({
    source: facility.source,
    source_family: "support_facility",
    level: "nearby_support_only",
    evidence_type:
      facility.type === "accessible_restroom" ? "accessible_restroom_nearby" : "wheelchair_charger_nearby",
    detail: facility.match_basis === "address_area"
      ? facility.type === "accessible_restroom"
        ? "동일 행정구역의 공중 장애인화장실 후보이며 정확한 거리는 확인되지 않았습니다."
        : "동일 행정구역의 전동휠체어 급속충전기 후보이며 정확한 거리는 확인되지 않았습니다."
      : facility.type === "accessible_restroom"
        ? "좌표 기반 주변 공중 장애인화장실 후보가 확인되었습니다."
        : "좌표 기반 주변 전동휠체어 급속충전기 후보가 확인되었습니다.",
    confidence: facility.match_basis === "address_area" ? 0.35 : 0.55,
    distance_m: facility.distance_m
  }));
}

export function officialSupportGrade(evidence: PublicSupportEvidence[]): OfficialSupportGrade {
  if (
    evidence.some(
      (item) =>
        item.evidence_type === "bf_certified" ||
        item.evidence_type === "disability_facility" ||
        item.evidence_type === "barrier_free_travel"
    )
  ) {
    return "O1";
  }
  if (evidence.length > 0) {
    return "O2";
  }
  return "none";
}

export function officialSupportScore(evidence: PublicSupportEvidence[]): number {
  const families = new Set<string>();
  let score = 0;
  for (const item of evidence) {
    const key = `${item.source_family}:${item.evidence_type}`;
    if (families.has(key)) continue;
    families.add(key);
    if (
      item.evidence_type === "bf_certified" ||
      item.evidence_type === "disability_facility" ||
      item.evidence_type === "barrier_free_travel"
    ) {
      score += 20;
      continue;
    }
    if (item.evidence_type === "culture_barrier_free" || item.evidence_type === "museum_accessibility") {
      score += 12;
      continue;
    }
    if (item.evidence_type === "accessible_restroom_nearby") {
      score += item.distance_m !== undefined && item.distance_m <= 300 ? 5 : 3;
      continue;
    }
    if (item.evidence_type === "wheelchair_charger_nearby") {
      score += item.distance_m !== undefined && item.distance_m <= 500 ? 5 : 3;
    }
  }
  return score;
}
