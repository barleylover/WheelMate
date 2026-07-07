import { config } from "../config.js";
import { applySchema, openDatabase } from "./db.js";
import { logger } from "../utils/logger.js";
import { loadBfKeadData } from "./loaders/bfKeadLoader.js";
import { loadBfKoddiData } from "./loaders/bfKoddiLoader.js";
import { loadCultureBarrierFreeData } from "./loaders/cultureBarrierFreeLoader.js";
import { loadDisabilityFacilitiesStandardData } from "./loaders/disabilityFacilitiesStandardLoader.js";
import { loadGyeonggiSharedDisabilityFacilitiesData } from "./loaders/gyeonggiSharedDisabilityFacilitiesLoader.js";
import { loadKtoBarrierFreeTravelData } from "./loaders/ktoBarrierFreeTravelLoader.js";
import { loadMuseumStandardData } from "./loaders/museumStandardLoader.js";
import { loadPublicRestroomData } from "./loaders/publicRestroomLoader.js";
import { loadSocialSecurityDisabilityFacilitiesData } from "./loaders/socialSecurityDisabilityFacilitiesLoader.js";
import { loadWheelchairChargerData } from "./loaders/wheelchairChargerLoader.js";

const db = openDatabase(config);
try {
  applySchema(db);
  logger.info("sqlite_schema_ready", { dbPath: config.dbPath });
} finally {
  db.close();
}

const loaders = [
  ["bf_kead", loadBfKeadData],
  ["bf_koddi", loadBfKoddiData],
  ["disability_facilities_standard", loadDisabilityFacilitiesStandardData],
  ["social_security_disability_facilities", loadSocialSecurityDisabilityFacilitiesData],
  ["public_restrooms", loadPublicRestroomData],
  ["wheelchair_chargers", loadWheelchairChargerData],
  ["culture_barrier_free", loadCultureBarrierFreeData],
  ["gyeonggi_shared_disability_facilities", loadGyeonggiSharedDisabilityFacilitiesData],
  ["kto_barrier_free_travel", loadKtoBarrierFreeTravelData],
  ["museum_standard", loadMuseumStandardData]
] as const;

for (const [name, load] of loaders) {
  const count = await load();
  logger.info("public_data_loader_finished", { name, count });
}
