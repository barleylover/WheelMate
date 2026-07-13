import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import type { AppConfig } from "../src/config.js";
import { createWheelMateHttpApp } from "../src/httpApp.js";

const config: AppConfig = {
  kakaoRestApiKey: undefined,
  naverClientId: undefined,
  naverClientSecret: undefined,
  publicDataServiceKey: undefined,
  ktoServiceKey: undefined,
  cultureBigdataApiKey: undefined,
  useNaverSearch: true,
  useDaumSearch: true,
  useReviewSearch: true,
  useNaverBlog: true,
  useNaverCafe: true,
  useNaverWeb: true,
  useDaumBlog: true,
  useDaumCafe: true,
  useDaumWeb: true,
  defaultRadiusM: 1000,
  defaultLimit: 5,
  maxPlaceCandidates: 15,
  maxReviewSearchCalls: 60,
  reviewCandidateConcurrency: 2,
  maxExternalApiCallsPerRequest: 40,
  searchResultsPerQuery: 3,
  searchTimeoutMs: 3500,
  dbPath: "./data/accessibility.db"
};

describe("anonymous HTTP MCP access", () => {
  let closeServer: (() => Promise<void>) | undefined;

  afterEach(async () => {
    await closeServer?.();
    closeServer = undefined;
  });

  it("accepts tools/call without an Authorization header", async () => {
    const app = createWheelMateHttpApp(config, {
      host: "127.0.0.1",
      allowedHosts: ["127.0.0.1", "localhost"]
    });
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    closeServer = () => new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });

    const { port } = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: "POST",
      headers: {
        accept: "application/json, text/event-stream",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "find_nearby_support_facilities",
          arguments: { location: "강남역", type: "all", radius_m: 500 }
        }
      })
    });
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).not.toContain("Bearer token");
    expect(body).toContain("request_budget");
  });
});
