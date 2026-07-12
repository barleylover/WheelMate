import { config } from "./config.js";
import { createWheelMateHttpApp } from "./httpApp.js";
import { logger } from "./utils/logger.js";

const host = process.env.HOST ?? "0.0.0.0";
const port = Number.parseInt(process.env.PORT ?? "8080", 10);
const allowedHosts = process.env.MCP_ALLOWED_HOSTS
  ?.split(",")
  .map((item) => item.trim())
  .filter(Boolean);

const app = createWheelMateHttpApp(config, { host, allowedHosts });

const httpServer = app.listen(port, host, () => {
  logger.info("http_mcp_server_listening", {
    host,
    port,
    endpoint: "/mcp"
  });
});

function shutdown(signal: string): void {
  logger.info("http_mcp_server_shutdown", { signal });
  httpServer.close(() => process.exit(0));
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
