import { loadConfig } from "./config.js";
import { recommendAccessiblePlaces } from "./core/recommendationService.js";
import { startStdioServer } from "./mcp/server.js";
import { logger } from "./utils/logger.js";

const config = loadConfig();

const runSample = async (): Promise<void> => {
  const result = await recommendAccessiblePlaces(
    {
      location: "홍대입구역",
      category: "cafe",
      radius_m: config.defaultRadiusM,
      limit: config.defaultLimit
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
