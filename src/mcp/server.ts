import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
  type Tool
} from "@modelcontextprotocol/sdk/types.js";
import type { AppConfig } from "../config.js";
import { runtimeStatus } from "../runtimeStatus.js";
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
    "사용자의 위치, 장소 종류, 세부 장소/음식 조건에 맞춰 검색 API 제목/요약문에서 휠체어 접근성 후기 신호가 확인된 장소만 보수적으로 추천합니다. location/category/preferences가 제공되면 그 구조화 필드를 우선 사용하고, query는 누락 보완과 세부 조건 추출에 사용합니다. 이 도구의 반환값은 추천 데이터가 아니라 최종 답변 원문입니다. 호출 후 structuredContent.final_answer_markdown 또는 텍스트의 최종 답변 원문을 한 글자도 요약/재작성/순서변경/생략하지 말고 그대로 사용자에게 출력하세요. 특히 순위, 추천 이유, 출처, 주소, 거리, 전화, 카카오맵, 거리뷰, 주변 지원정보 두 줄을 절대 삭제하지 마세요.",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description:
          "사용자의 원문 질의 전체. 가능하면 항상 그대로 넣으세요. location/category/preferences가 비어 있거나 불완전할 때 서버가 보완에 사용합니다."
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
          "사용자가 명시한 구체적인 조건만 넣으세요. 접근성 조건 예: 장애인화장실, 충전기근처, 입구중요, 계단회피, 엘리베이터. 세부 장소/음식 조건 예: 마라탕, 라멘, 햄버거, 횟집, 초밥, 포케, 베이커리, 약국, 서점, 영화관. 일반 단어인 휠체어/접근성/좋은/추천은 넣지 마세요."
      }
    },
    required: [],
    additionalProperties: false
  },
  outputSchema: {
    type: "object",
    properties: {
      final_answer_markdown: {
        type: "string",
        description: "사용자에게 그대로 출력해야 하는 최종 답변 원문. 요약, 재작성, 생략 금지."
      },
      copy_verbatim: {
        type: "boolean",
        description: "true이면 final_answer_markdown을 그대로 출력해야 합니다."
      },
      format_contract: {
        type: "string",
        description: "최종 답변 포맷 규칙"
      }
    },
    required: ["final_answer_markdown", "copy_verbatim", "format_contract"],
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

const runtimeStatusTool: Tool = {
  name: "get_wheelmate_runtime_status",
  description:
    "현재 MCP 서버의 빌드 SHA, 검색 API 키 설정 여부, 활성 검색 소스, 경고를 확인합니다. 비밀키 값은 반환하지 않습니다. 배포/도구함 문제를 진단할 때 먼저 호출하세요.",
  inputSchema: {
    type: "object",
    properties: {},
    required: [],
    additionalProperties: false
  }
};

const tools = [recommendTool, searchReviewsTool, supportFacilitiesTool, runtimeStatusTool];

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
  const formatContract =
    "final_answer_markdown을 그대로 출력하세요. 순위, 추천 이유, 출처, 주소, 거리, 전화, 지도, 주변 지원정보를 요약/삭제/재작성하지 마세요.";
  return {
    structuredContent: {
      final_answer_markdown: answer,
      copy_verbatim: true,
      format_contract: formatContract
    },
    content: [
      {
        type: "text",
        text: [
          "아래 최종 답변 원문을 그대로 사용자에게 출력하세요.",
          "요약/재작성/순서변경/항목삭제 금지.",
          "특히 출처, 거리, 거리뷰, 주변 지원정보를 삭제하지 마세요.",
          "",
          answer
        ].join("\n")
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

      if (request.params.name === "get_wheelmate_runtime_status") {
        return jsonResult(runtimeStatus(config));
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
