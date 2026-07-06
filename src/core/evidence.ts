import type { AccessibilityEvidence } from "./types.js";

export const confirmedAccessibilityLabels = (evidence: AccessibilityEvidence[]): string[] => {
  const labels = new Set<string>();

  for (const item of evidence) {
    if (item.evidenceType === "wheelchair_entrance" && item.value === true) {
      labels.add("휠체어 이용 가능 입구");
    }
    if (item.evidenceType === "wheelchair_seating" && item.value === true) {
      labels.add("휠체어 이용 가능 좌석");
    }
    if (item.evidenceType === "wheelchair_restroom" && item.value === true) {
      labels.add("휠체어 이용 가능 화장실");
    }
    if (item.evidenceType === "wheelchair_parking" && item.value === true) {
      labels.add("휠체어 이용 가능 주차");
    }
    if (item.evidenceType === "osm_wheelchair" && item.value === "yes") {
      labels.add("OSM wheelchair=yes");
    }
    if (item.evidenceType === "osm_wheelchair" && item.value === "limited") {
      labels.add("OSM wheelchair=limited");
    }
    if (item.evidenceType === "bf_certified") {
      labels.add("BF 인증 시설 정보 매칭");
    }
    if (item.evidenceType === "disability_facility") {
      labels.add("장애인편의시설 데이터 매칭");
    }
  }

  return [...labels];
};

export const unknownAccessibilityItems = (): string[] => [
  "실제 문턱 높이",
  "입구 폭",
  "실내 좌석 간격",
  "당일 혼잡도",
  "매장 구조 변경 여부"
];
