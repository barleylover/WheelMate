import { createBuildingAccessibilityRawLoader } from "./buildingAccessibilityRawLoader.js";

// 한국사회보장정보원_장애인편의시설 현황 (메인 데이터 2)
export const socialSecurityDisabilityFacilitiesLoader = createBuildingAccessibilityRawLoader({
  source: "한국사회보장정보원_장애인편의시설 현황",
  fileNames: ["social_security_disability_facilities.json", "social_security_disability_facilities.csv"]
});
