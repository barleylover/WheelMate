import path from "node:path";
import { loadConfig } from "../config.js";
import { logger } from "../utils/logger.js";
import { WheelMateDatabase } from "./db.js";
import { bfKeadLoader } from "./loaders/bfKeadLoader.js";
import { bfKoddiLoader } from "./loaders/bfKoddiLoader.js";
import { cultureBarrierFreeLoader } from "./loaders/cultureBarrierFreeLoader.js";
import { disabilityFacilitiesStandardLoader } from "./loaders/disabilityFacilitiesStandardLoader.js";
import { gyeonggiSharedDisabilityFacilitiesLoader } from "./loaders/gyeonggiSharedDisabilityFacilitiesLoader.js";
import { ktoBarrierFreeTravelLoader } from "./loaders/ktoBarrierFreeTravelLoader.js";
import { museumStandardLoader } from "./loaders/museumStandardLoader.js";
import { publicRestroomLoader } from "./loaders/publicRestroomLoader.js";
import { socialSecurityDisabilityFacilitiesLoader } from "./loaders/socialSecurityDisabilityFacilitiesLoader.js";
import { wheelchairChargerLoader } from "./loaders/wheelchairChargerLoader.js";
import type { PublicDataLoader } from "./loaders/types.js";

const loaders: PublicDataLoader[] = [
  bfKeadLoader,
  bfKoddiLoader,
  disabilityFacilitiesStandardLoader,
  socialSecurityDisabilityFacilitiesLoader,
  publicRestroomLoader,
  wheelchairChargerLoader,
  cultureBarrierFreeLoader,
  gyeonggiSharedDisabilityFacilitiesLoader,
  ktoBarrierFreeTravelLoader,
  museumStandardLoader
];

export const runIngest = async (): Promise<void> => {
  const config = loadConfig();
  const db = new WheelMateDatabase(config.dbPath);
  db.init();
  const rawDir = path.resolve(process.cwd(), "data/raw");

  for (const loader of loaders) {
    try {
      const result = await loader.load({ db, rawDir });
      logger.info(`ingest ${result.status}: ${result.source}`, {
        loadedCount: result.loadedCount,
        message: result.message
      });
    } catch (error) {
      logger.warn(`ingest failed: ${loader.source}`, {
        reason: error instanceof Error ? error.message : String(error)
      });
    }
  }

  db.close();
};

if (import.meta.url === `file://${process.argv[1]}`) {
  await runIngest();
}
