import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { AppConfig } from "../config.js";
import {
  createRecommendAccessiblePlacesHandler,
  recommendAccessiblePlacesInputSchema
} from "./tools/recommendAccessiblePlaces.js";

export const createWheelMateMcpServer = (config: AppConfig): McpServer => {
  const server = new McpServer({
    name: "WheelMate",
    version: "0.1.0"
  });

  server.registerTool(
    "recommend_accessible_places",
    {
      title: "Recommend accessible places",
      description:
        "사용자 위치와 카테고리를 받아 휠체어 접근성 근거가 확인된 정도를 보수적으로 등급화해 장소를 추천합니다.",
      inputSchema: recommendAccessiblePlacesInputSchema
    },
    createRecommendAccessiblePlacesHandler(config)
  );

  return server;
};

export const startStdioServer = async (config: AppConfig): Promise<void> => {
  const server = createWheelMateMcpServer(config);
  const transport = new StdioServerTransport();
  await server.connect(transport);
};
