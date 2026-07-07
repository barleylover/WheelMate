import { createBuildingAccessibilityRawLoader } from "./buildingAccessibilityRawLoader.js";

// 한국장애인개발원_장애물 없는 생활환경(BF) 인증 정보 → 매칭 시 BF 인증(A 등급)
export const bfKoddiLoader = createBuildingAccessibilityRawLoader({
  source: "한국장애인개발원_장애물없는생활환경인증 정보",
  fileNames: ["bf_koddi.json", "bf_koddi.csv"],
  markAllBfCertified: true
});
