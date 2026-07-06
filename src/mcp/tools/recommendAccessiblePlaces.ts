import { z } from "zod";
import type { AppConfig } from "../../config.js";
import { recommendAccessiblePlaces } from "../../core/recommendationService.js";
import type { RecommendAccessiblePlacesInput } from "../../core/types.js";

export const recommendAccessiblePlacesInputSchema = {
  query: z.string().optional().describe("사용자의 원문 질의"),
  location: z.string().min(1).describe("예: 홍대입구역, 강남역, 서울시청"),
  category: z
    .enum(["cafe", "restaurant", "culture", "museum", "restroom", "charger", "any"])
    .optional()
    .describe("원하는 장소 카테고리"),
  radius_m: z.number().positive().max(3000).optional().describe("검색 반경 미터. 기본값 800"),
  limit: z.number().int().positive().max(10).optional().describe("추천 개수. 기본값 5"),
  preferences: z.array(z.string()).optional().describe("예: 조용한, 장애인화장실, 충전기근처, 입구중요")
};

const parsedInputSchema = z.object(recommendAccessiblePlacesInputSchema);

export const createRecommendAccessiblePlacesHandler =
  (config: AppConfig) =>
  async (input: unknown): Promise<{ content: Array<{ type: "text"; text: string }> }> => {
    const parsed = parsedInputSchema.parse(input) as RecommendAccessiblePlacesInput;
    const result = await recommendAccessiblePlaces(parsed, config);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2)
        }
      ]
    };
  };
