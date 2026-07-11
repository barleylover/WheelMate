import type { AppConfig } from "../../config.js";
import { ReviewSearchService } from "../../reviewSearch/reviewSearchService.js";
import { RequestBudget } from "../../utils/requestBudget.js";

export interface SearchPlaceAccessibilityReviewsInput {
  place_name: string;
  address?: string;
  neighborhood?: string;
  category?: string;
  limit?: number;
}

export async function searchPlaceAccessibilityReviews(
  input: SearchPlaceAccessibilityReviewsInput,
  config: AppConfig
): Promise<Record<string, unknown>> {
  const budget = new RequestBudget(config.maxExternalApiCallsPerRequest);
  const service = new ReviewSearchService(config, budget);
  const result = await service.searchPlaceAccessibilityReviews(input);
  return {
    ...result,
    request_budget: service.budgetSnapshot()
  } as unknown as Record<string, unknown>;
}
