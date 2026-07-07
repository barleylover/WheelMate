import { createBuildingAccessibilityRawLoader } from "./buildingAccessibilityRawLoader.js";

// 한국장애인고용공단_장애물 없는 생활환경(BF) 인증 시설 정보 → 매칭 시 BF 인증(A 등급)
export const bfKeadLoader = createBuildingAccessibilityRawLoader({
  source: "한국장애인고용공단_장애물 없는 생활환경 인증 시설 정보",
  fileNames: ["bf_kead.json", "bf_kead.csv"],
  markAllBfCertified: true
});
