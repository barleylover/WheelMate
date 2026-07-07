import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import type { Request, Response } from "express";
import { config } from "./config.js";
import { configFromAuthorization } from "./auth/playMcpConfigToken.js";
import { createMcpServer } from "./mcp/server.js";
import { logger } from "./utils/logger.js";

const host = process.env.HOST ?? "0.0.0.0";
const port = Number.parseInt(process.env.PORT ?? "8080", 10);
const allowedHosts = process.env.MCP_ALLOWED_HOSTS
  ?.split(",")
  .map((item) => item.trim())
  .filter(Boolean);

const app = createMcpExpressApp({ host, allowedHosts });

app.get("/", (_req: Request, res: Response) => {
  res.status(200).json({
    name: "WheelMate Review Search MCP",
    status: "ok",
    mcp_endpoint: "/mcp"
  });
});

app.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({ status: "ok" });
});

app.post("/mcp", async (req: Request, res: Response) => {
  const requestConfig = configFromAuthorization(config, req.header("authorization"));
  const server = createMcpServer(requestConfig);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined
  });
  let cleanedUp = false;
  const cleanup = (): void => {
    if (cleanedUp) return;
    cleanedUp = true;
    void transport.close();
    void server.close();
  };

  try {
    await server.connect(transport);
    res.on("close", cleanup);
    res.on("finish", cleanup);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    logger.error("http_mcp_request_failed", {
      error: error instanceof Error ? error.message : String(error)
    });
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: "Internal server error"
        },
        id: null
      });
    }
  } finally {
    if (res.writableEnded) cleanup();
  }
});

app.get("/mcp", (_req: Request, res: Response) => {
  res.status(405).json({
    jsonrpc: "2.0",
    error: {
      code: -32000,
      message: "Method not allowed. Use POST for stateless MCP requests."
    },
    id: null
  });
});

app.delete("/mcp", (_req: Request, res: Response) => {
  res.status(405).json({
    jsonrpc: "2.0",
    error: {
      code: -32000,
      message: "Method not allowed."
    },
    id: null
  });
});

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
