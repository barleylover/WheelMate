import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Request, Response } from "express";
import type { AppConfig } from "./config.js";
import { createMcpServer } from "./mcp/server.js";
import { runtimeStatus } from "./runtimeStatus.js";
import { logger } from "./utils/logger.js";

export interface HttpAppOptions {
  host: string;
  allowedHosts?: string[];
}

export function createWheelMateHttpApp(config: AppConfig, options: HttpAppOptions) {
  const app = createMcpExpressApp({ host: options.host, allowedHosts: options.allowedHosts });

  function publicHealthStatus(): Record<string, unknown> {
    const status = runtimeStatus(config);
    return {
      service: status.service,
      status: status.status,
      access: status.access,
      build: status.build
    };
  }

  app.get("/", (_req: Request, res: Response) => {
    res.status(200).json({
      name: "WheelMate Review Search MCP",
      status: "ok",
      mcp_endpoint: "/mcp",
      access: publicHealthStatus().access,
      build: publicHealthStatus().build
    });
  });

  app.get("/health", (_req: Request, res: Response) => {
    res.status(200).json(publicHealthStatus());
  });

  app.post("/mcp", async (req: Request, res: Response) => {
    const server = createMcpServer(config);
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

  return app;
}
