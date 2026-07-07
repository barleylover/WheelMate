import { createBuildingAccessibilityRawLoader } from "./buildingAccessibilityRawLoader.js";

// 경기도_경기공유 장애인시설 (경기도 특화 fallback)
export const gyeonggiSharedDisabilityFacilitiesLoader = createBuildingAccessibilityRawLoader({
  source: "경기도_경기공유 장애인시설",
  fileNames: ["gyeonggi_disability_facilities.json", "gyeonggi_disability_facilities.csv"]
});
