export function fallbackReasonForReviewResults(positiveCount: number, limit: number): string | null {
  return positiveCount < Math.min(3, limit) ? "review_positive_results_below_threshold" : null;
}
