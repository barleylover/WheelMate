import { createSupportFacilityRawLoader } from "./sampleRawLoader.js";

export const wheelchairChargerLoader = createSupportFacilityRawLoader({
  source: "전국전동휠체어급속충전기표준데이터",
  defaultType: "wheelchair_charger",
  fileNames: ["wheelchair_chargers.json", "wheelchair_chargers.csv"]
});
