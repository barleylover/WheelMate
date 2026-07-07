import { config } from "./config.js";
import { runStdioServer } from "./mcp/server.js";
import { logger } from "./utils/logger.js";

runStdioServer(config).catch((error) => {
  logger.error("mcp_server_failed", {
    error: error instanceof Error ? error.message : String(error)
  });
  process.exit(1);
});
