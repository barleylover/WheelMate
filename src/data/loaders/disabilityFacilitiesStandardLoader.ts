import { createBuildingAccessibilityRawLoader } from "./buildingAccessibilityRawLoader.js";

// 전국장애인편의시설표준데이터 (한국사회보장정보원 / data.go.kr 15100058)
// data.go.kr 그리드 탭에서 JSON 또는 CSV 로 내려받아 data/raw/ 에 둔다.
export const disabilityFacilitiesStandardLoader = createBuildingAccessibilityRawLoader({
  source: "전국장애인편의시설표준데이터",
  fileNames: ["disability_facilities.json", "disability_facilities.csv"]
});
