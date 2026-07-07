import type { AppConfig } from "../../config.js";
import { ReviewSearchService } from "../../reviewSearch/reviewSearchService.js";

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
  const service = new ReviewSearchService(config);
  return service.searchPlaceAccessibilityReviews(input) as unknown as Record<string, unknown>;
}
