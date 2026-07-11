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
  MAX_RADIUS_M,
  MAX_RECOMMENDATION_LIMIT,
  MAX_REVIEW_RESULT_LIMIT,
  MIN_RADIUS_M,
  normalizePreferenceList
} from "../core/inputLimits.js";
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
    "WheelMate의 장소 추천 툴입니다. 사용자의 위치와 원하는 장소/음식 조건을 입력받아 네이버·다음 검색 결과의 블로그·카페·웹문서에서 휠체어 접근성 후기 신호가 확인된 장소를 찾아 추천합니다. 각 추천 결과에는 추천 이유, 출처 링크, 주소, 거리, 전화번호, 카카오맵/거리뷰, 주변 장애인 화장실·전동휠체어 충전기 정보를 함께 제공합니다.",
  annotations: {
    title: "WheelMate 접근성 장소 추천",
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: true,
    idempotentHint: true
  },
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        maxLength: 300,
        description:
          "사용자의 원문 질의 전체. 가능하면 항상 그대로 넣으세요. location/category/preferences가 비어 있거나 불완전할 때 서버가 보완에 사용합니다."
      },
      location: { type: "string", maxLength: 100, description: "예: 홍대입구역, 강남역, 서울시청. query에 명확히 포함되어 있으면 생략 가능" },
      category: {
        type: "string",
        enum: ["cafe", "restaurant", "culture", "museum", "restroom", "charger", "any"]
      },
      radius_m: {
        type: "integer",
        minimum: MIN_RADIUS_M,
        maximum: MAX_RADIUS_M,
        default: 1000,
        description: "역·동 같은 지점형 위치의 검색 반경입니다. 서울·부산·제주도 같은 광역 위치는 서버가 최대 20km 범위로 해석합니다."
      },
      limit: { type: "integer", minimum: 1, maximum: MAX_RECOMMENDATION_LIMIT, default: 5 },
      preferences: {
        type: "array",
        maxItems: 8,
        items: { type: "string", maxLength: 40 },
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
        description: "WheelMate가 생성한 추천 답변 Markdown입니다."
      },
      copy_verbatim: {
        type: "boolean",
        description: "true이면 final_answer_markdown을 사용자 답변으로 사용할 수 있습니다."
      },
      format_contract: {
        type: "string",
        description: "추천 답변에 포함되는 항목 구조입니다."
      }
    },
    required: ["final_answer_markdown", "copy_verbatim", "format_contract"],
    additionalProperties: false
  }
};

const searchReviewsTool: Tool = {
  name: "search_place_accessibility_reviews",
  description:
    "WheelMate에서 특정 장소 이름을 기준으로 네이버·다음 검색 결과를 조회해 휠체어 접근성 관련 후기 신호와 출처 링크를 확인합니다.",
  annotations: {
    title: "WheelMate 장소 접근성 후기 검색",
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: true,
    idempotentHint: true
  },
  inputSchema: {
    type: "object",
    properties: {
      place_name: { type: "string", maxLength: 120 },
      address: { type: "string", maxLength: 200 },
      neighborhood: { type: "string", maxLength: 100 },
      category: { type: "string", maxLength: 50 },
      limit: { type: "integer", minimum: 1, maximum: MAX_REVIEW_RESULT_LIMIT, default: 5 }
    },
    required: ["place_name"],
    additionalProperties: false
  }
};

const supportFacilitiesTool: Tool = {
  name: "find_nearby_support_facilities",
  description:
    "WheelMate에서 입력한 위치 주변의 장애인 화장실과 전동휠체어 급속충전기 후보를 공공데이터 기반으로 찾아 이름, 주소, 거리 정보를 반환합니다.",
  annotations: {
    title: "WheelMate 주변 지원시설 검색",
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: true,
    idempotentHint: true
  },
  inputSchema: {
    type: "object",
    properties: {
      location: { type: "string", maxLength: 100 },
      type: { type: "string", enum: ["accessible_restroom", "wheelchair_charger", "all"] },
      radius_m: { type: "integer", minimum: MIN_RADIUS_M, maximum: MAX_RADIUS_M, default: 800 },
      limit: { type: "integer", minimum: 1, maximum: MAX_REVIEW_RESULT_LIMIT, default: 5 }
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

function readString(args: Record<string, unknown>, name: string, maxLength = 300): string | undefined {
  const value = args[name];
  return typeof value === "string" && value.trim() ? value.trim().slice(0, maxLength) : undefined;
}

function readNumber(args: Record<string, unknown>, name: string): number | undefined {
  const value = args[name];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readStringArray(args: Record<string, unknown>, name: string): string[] | undefined {
  const value = args[name];
  return Array.isArray(value)
    ? normalizePreferenceList(value.filter((item): item is string => typeof item === "string"))
    : undefined;
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
        const query = readString(args, "query", 300);
        const location = readString(args, "location", 100);
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
        const placeName = readString(args, "place_name", 120);
        if (!placeName) return errorResult("place_name is required");
        const input: SearchPlaceAccessibilityReviewsInput = {
          place_name: placeName,
          address: readString(args, "address", 200),
          neighborhood: readString(args, "neighborhood", 100),
          category: readString(args, "category", 50),
          limit: readNumber(args, "limit")
        };
        return jsonResult(await searchPlaceAccessibilityReviews(input, config));
      }

      if (request.params.name === "find_nearby_support_facilities") {
        const location = readString(args, "location", 100);
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
