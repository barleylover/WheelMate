import { loadConfig } from "./config.js";
import { recommendAccessiblePlaces } from "./core/recommendationService.js";
import type { Category } from "./core/types.js";
import { startStdioServer } from "./mcp/server.js";
import { logger } from "./utils/logger.js";

const config = loadConfig();

// 사용법: npm run dev -- --sample [장소] [카테고리] [--no-franchise]
// 예:     npm run dev -- --sample "강남역" cafe --no-franchise
const runSample = async (): Promise<void> => {
  const args = process.argv.slice(2).filter((arg) => arg !== "--sample");
  const excludeFranchise = args.includes("--no-franchise") || args.includes("--exclude-franchise");
  const positional = args.filter((arg) => !arg.startsWith("--"));
  const location = positional[0] ?? "성수역";
  const category = (positional[1] as Category | undefined) ?? "cafe";

  const result = await recommendAccessiblePlaces(
    {
      location,
      category,
      radius_m: config.defaultRadiusM,
      limit: config.defaultLimit,
      exclude_franchise: excludeFranchise
    },
    config
  );
  console.log(JSON.stringify(result, null, 2));
};

if (process.argv.includes("--sample")) {
  await runSample();
} else {
  try {
    await startStdioServer(config);
  } catch (error) {
    logger.error("WheelMate MCP server failed", {
      reason: error instanceof Error ? error.message : String(error)
    });
    process.exitCode = 1;
  }
}
