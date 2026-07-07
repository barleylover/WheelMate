import type { AccessibilityEvidence, AccessibilityGrade } from "./types.js";

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
    if (item.evidenceType === "threshold_removed" && item.value) {
      labels.add("주출입구 턱 없음(높이차이 제거)");
    }
    if (item.evidenceType === "entrance_ramp" && item.value) {
      labels.add("주출입구 경사로/접근로");
    }
    if (item.evidenceType === "elevator" && item.value) {
      labels.add("건물 내 승강기");
    }
    if (item.evidenceType === "building_accessible_restroom" && item.value) {
      labels.add("건물 내 장애인화장실");
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

/** 이 장소를 추천하는 이유를 등급·근거·거리·주변시설로 한국어 한 문장으로 생성한다. */
export const recommendationReason = (
  grade: AccessibilityGrade,
  confirmedLabels: string[],
  distanceM: number,
  supportNames: string[]
): string => {
  const evidenceNote = confirmedLabels.length > 0 ? `(${confirmedLabels.join(", ")})` : "";
  const base =
    grade === "A"
      ? `BF 인증 등 건물 단위 접근성이 확인된 곳이에요${evidenceNote}.`
      : grade === "B"
        ? `경사로·승강기·장애인화장실 등 접근 편의가 확인된 곳이에요${evidenceNote}.`
        : grade === "C"
          ? `휠체어로 접근 가능한 것으로 확인된 곳이에요${evidenceNote}.`
          : "접근성 근거는 아직 확인되지 않았지만, 거리가 가까워 참고용으로 넣었어요.";
  const proximity =
    distanceM <= 300 ? "매우 가까워요" : distanceM <= 800 ? "가까운 편이에요" : "조금 떨어져 있어요";
  const distanceNote = `출발지에서 약 ${distanceM}m로 ${proximity}.`;
  const supportNote = supportNames.length > 0 ? ` 주변에 ${supportNames.join(", ")}도 있어요.` : "";
  return `${base} ${distanceNote}${supportNote}`;
};
