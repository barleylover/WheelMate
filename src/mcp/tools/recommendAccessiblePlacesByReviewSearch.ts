import type { AppConfig } from "../../config.js";
import { runRecommendationEngine } from "../../search/recommendationEngine.js";
import type { RecommendIntentInput } from "../../search/intentResolver.js";

export interface RecommendAccessiblePlacesInput extends RecommendIntentInput {}

export {
  contentSearchPreferences,
  inferCategoryFromQuery,
  inferLocationFromQuery,
  resolveRecommendSearchIntent
} from "../../search/intentResolver.js";

/**
 * MCP boundary for the place-first search engine. Natural-language intent,
 * candidate generation, web-evidence matching, ranking, and response rendering
 * live in independent modules so each boundary can be regression-tested.
 */
export async function recommendAccessiblePlacesByReviewSearch(
  input: RecommendAccessiblePlacesInput,
  config: AppConfig
): Promise<Record<string, unknown>> {
  return runRecommendationEngine(input, config);
}
