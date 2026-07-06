import { createSupportFacilityRawLoader } from "./sampleRawLoader.js";

export const publicRestroomLoader = createSupportFacilityRawLoader({
  source: "전국공중화장실표준데이터",
  defaultType: "accessible_restroom",
  fileNames: ["public_restrooms.json", "public_restrooms.csv"]
});
