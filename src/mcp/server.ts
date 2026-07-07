import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
  type Tool
} from "@modelcontextprotocol/sdk/types.js";
import type { AppConfig } from "../config.js";
import {
  findNearbySupportFacilities,
  type FindNearbySupportFacilitiesInput
} from "./tools/findNearbySupportFacilities.js";
import {
  recommendAccessiblePlacesByReviewSearch,
  type RecommendAccessiblePlacesInput
} from "./tools/recommendAccessiblePlacesByReviewSearch.js";
import {
  searchPlaceAccessibilityReviews,
  type SearchPlaceAccessibilityReviewsInput
} from "./tools/searchPlaceAccessibilityReviews.js";

const recommendTool: Tool = {
  name: "recommend_accessible_places_by_review_search",
  description:
    "사용자의 원문 질의를 우선 해석해 위치/카테고리/세부 조건을 보정하고, 검색 API 제목/요약문에서 휠체어 접근성 후기 신호를 찾아 보수적으로 추천합니다. 결과의 answer_markdown을 사용자에게 우선 그대로 보여주세요. 재요약하더라도 출처 링크와 거리뷰 링크는 반드시 포함해야 합니다.",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description:
          "사용자의 원문 질의 전체. 가능하면 항상 그대로 넣으세요. 서버는 query를 기준으로 location/category/preferences를 재검증합니다."
      },
      location: { type: "string", description: "예: 홍대입구역, 강남역, 서울시청. query에 명확히 포함되어 있으면 생략 가능" },
      category: {
        type: "string",
        enum: ["cafe", "restaurant", "culture", "museum", "restroom", "charger", "any"]
      },
      radius_m: { type: "number", default: 800 },
      limit: { type: "number", default: 5 },
      preferences: {
        type: "array",
        items: { type: "string" },
        description:
          "접근성 조건과 세부 장소/음식 조건. 예: 장애인화장실, 충전기근처, 입구중요, 계단회피, 엘리베이터, 마라탕, 라멘, 햄버거, 초밥, 포케, 베이커리, 약국, 서점, 영화관. 일반 단어인 휠체어/접근성은 넣지 마세요. query와 충돌하면 서버는 query를 우선합니다."
      }
    },
    required: [],
    additionalProperties: false
  }
};

const searchReviewsTool: Tool = {
  name: "search_place_accessibility_reviews",
  description:
    "특정 장소 하나에 대해 6개 검색 API를 사용해 접근성 관련 검색 결과와 신호를 반환합니다.",
  inputSchema: {
    type: "object",
    properties: {
      place_name: { type: "string" },
      address: { type: "string" },
      neighborhood: { type: "string" },
      category: { type: "string" },
      limit: { type: "number", default: 5 }
    },
    required: ["place_name"],
    additionalProperties: false
  }
};

const supportFacilitiesTool: Tool = {
  name: "find_nearby_support_facilities",
  description: "장애인 화장실 또는 전동휠체어 급속충전기를 주변에서 찾습니다.",
  inputSchema: {
    type: "object",
    properties: {
      location: { type: "string" },
      type: { type: "string", enum: ["accessible_restroom", "wheelchair_charger", "all"] },
      radius_m: { type: "number", default: 800 },
      limit: { type: "number", default: 5 }
    },
    required: ["location", "type"],
    additionalProperties: false
  }
};

const tools = [recommendTool, searchReviewsTool, supportFacilitiesTool];

function jsonResult(value: unknown): CallToolResult {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(value, null, 2)
      }
    ]
  };
}

function answerJsonResult(value: Record<string, unknown>): CallToolResult {
  const answer = typeof value.answer_markdown === "string" ? value.answer_markdown : JSON.stringify(value, null, 2);
  return {
    content: [
      {
        type: "text",
        text: answer
      },
      {
        type: "text",
        text: JSON.stringify(value, null, 2)
      }
    ]
  };
}

function errorResult(message: string): CallToolResult {
  return {
    isError: true,
    content: [{ type: "text", text: message }]
  };
}

function readString(args: Record<string, unknown>, name: string): string | undefined {
  const value = args[name];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readNumber(args: Record<string, unknown>, name: string): number | undefined {
  const value = args[name];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readStringArray(args: Record<string, unknown>, name: string): string[] | undefined {
  const value = args[name];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : undefined;
}

export function createMcpServer(config: AppConfig): Server {
  const server = new Server(
    {
      name: "wheelmate-review-search-mcp",
      version: "0.1.0"
    },
    {
      capabilities: {
        tools: {}
      }
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const args = (request.params.arguments ?? {}) as Record<string, unknown>;
    try {
      if (request.params.name === "recommend_accessible_places_by_review_search") {
        const query = readString(args, "query");
        const location = readString(args, "location");
        if (!location && !query) return errorResult("location or query is required");
        const input: RecommendAccessiblePlacesInput = {
          query,
          location,
          category: readString(args, "category") as RecommendAccessiblePlacesInput["category"],
          radius_m: readNumber(args, "radius_m"),
          limit: readNumber(args, "limit"),
          preferences: readStringArray(args, "preferences")
        };
        return answerJsonResult(await recommendAccessiblePlacesByReviewSearch(input, config));
      }

      if (request.params.name === "search_place_accessibility_reviews") {
        const placeName = readString(args, "place_name");
        if (!placeName) return errorResult("place_name is required");
        const input: SearchPlaceAccessibilityReviewsInput = {
          place_name: placeName,
          address: readString(args, "address"),
          neighborhood: readString(args, "neighborhood"),
          category: readString(args, "category"),
          limit: readNumber(args, "limit")
        };
        return jsonResult(await searchPlaceAccessibilityReviews(input, config));
      }

      if (request.params.name === "find_nearby_support_facilities") {
        const location = readString(args, "location");
        if (!location) return errorResult("location is required");
        const input: FindNearbySupportFacilitiesInput = {
          location,
          type: (readString(args, "type") ?? "all") as FindNearbySupportFacilitiesInput["type"],
          radius_m: readNumber(args, "radius_m"),
          limit: readNumber(args, "limit")
        };
        return jsonResult(await findNearbySupportFacilities(input, config));
      }

      return errorResult(`Unknown tool: ${request.params.name}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return errorResult(message);
    }
  });

  return server;
}

export async function runStdioServer(config: AppConfig): Promise<void> {
  const server = createMcpServer(config);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
