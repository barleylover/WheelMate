import type { OfficialSupportGrade, PublicSupportEvidence, SupportFacility } from "../types.js";

export function supportEvidenceFromFacilities(facilities: SupportFacility[]): PublicSupportEvidence[] {
  return facilities.map((facility) => ({
    source: facility.source,
    source_family: "support_facility",
    level: "nearby_support_only",
    evidence_type:
      facility.type === "accessible_restroom" ? "accessible_restroom_nearby" : "wheelchair_charger_nearby",
    detail:
      facility.type === "accessible_restroom"
        ? "주변 공중 장애인화장실 후보가 확인되었습니다."
        : "주변 전동휠체어 급속충전기 후보가 확인되었습니다.",
    confidence: 0.55,
    distance_m: facility.distance_m
  }));
}

export function officialSupportGrade(evidence: PublicSupportEvidence[]): OfficialSupportGrade {
  if (
    evidence.some(
      (item) => item.evidence_type === "bf_certified" || item.evidence_type === "disability_facility"
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
    if (item.evidence_type === "bf_certified" || item.evidence_type === "disability_facility") {
      score += 20;
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
