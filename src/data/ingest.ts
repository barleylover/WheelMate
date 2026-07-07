import path from "node:path";
import { pathToFileURL } from "node:url";
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
import { buildingAccessibilityApiLoader } from "./loaders/buildingAccessibilityApiLoader.js";
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

  // `--api` 플래그가 있을 때만 data.go.kr OpenAPI 로더를 포함한다(개발계정 100콜/일 쿼터 보호).
  const useApi = process.argv.includes("--api");
  const activeLoaders = useApi ? [...loaders, buildingAccessibilityApiLoader] : loaders;

  for (const loader of activeLoaders) {
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

// Windows 에서 process.argv[1] 은 백슬래시 경로라 `file://${argv}` 비교가 깨진다.
// pathToFileURL 로 정규화해 크로스플랫폼으로 "직접 실행" 여부를 판별한다.
const entryArg = process.argv[1];
if (entryArg && import.meta.url === pathToFileURL(entryArg).href) {
  await runIngest();
}
