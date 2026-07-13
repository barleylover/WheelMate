import type { AppConfig } from "../config.js";
import { KakaoLocalClient } from "../clients/kakaoLocalClient.js";
import { PublicDataClient } from "../clients/publicDataClient.js";
import { fallbackReasonForReviewResults } from "../core/fallback.js";
import {
  officialSupportGrade,
  officialSupportScore,
  supportEvidenceFromFacilities
} from "../core/publicEvidence.js";
import { buildRecommendResponse } from "../reviewSearch/reviewResponseBuilder.js";
import {
  calculateRankingScore,
  partitionRankedPlaces,
  recommendationStatus,
  sortRankedPlaces
} from "../reviewSearch/reviewRanking.js";
import { ReviewSearchService } from "../reviewSearch/reviewSearchService.js";
import type {
  Coordinates,
  Origin,
  PlaceCandidate,
  PublicSupportEvidence,
  QueryInterpretation,
  RankedPlace,
  ReviewAnalysis,
  ReviewSignal,
  SupportFacility
} from "../types.js";
import { RequestBudget, type RequestBudgetSnapshot } from "../utils/requestBudget.js";
import { mapWithConcurrency } from "../utils/concurrency.js";
import { attachBroadAccessibilityEvidence, type SearchQueryRunner } from "./broadEvidenceMatcher.js";
import { buildCandidatePool, type PlaceSearchProvider } from "./candidateSearch.js";
import {
  resolveSearchIntent,
  type RecommendIntentInput,
  type ResolvedSearchIntent
} from "./intentResolver.js";
import { originIsResolved } from "./locationScope.js";

export interface RecommendationEngineDependencies {
  createPlaceClient?: (config: AppConfig, budget: RequestBudget) => PlaceEngineClient;
  createReviewService?: (config: AppConfig, budget: RequestBudget) => ReviewEngineService;
  createPublicDataClient?: (config: AppConfig) => PublicDataProvider;
}

export interface PlaceEngineClient extends PlaceSearchProvider {
  resolveLocation(location: string): Promise<Origin>;
}

export interface ReviewEngineService extends SearchQueryRunner {
  analyzePlace(
    place: PlaceCandidate,
    neighborhood?: string,
    preferences?: string[],
    maxQueries?: number
  ): Promise<ReviewAnalysis>;
}

export interface PublicDataProvider {
  findNearbySupportFacilities(
    origin: Coordinates,
    type: "accessible_restroom" | "wheelchair_charger" | "all",
    radiusM: number,
    limit: number,
    originAddress?: string
  ): SupportFacility[];
  findMatchingAccessibilityEvidence(place: PlaceCandidate): PublicSupportEvidence[];
}

function hasSignal(signals: ReviewSignal[], type: string, polarity = "positive"): boolean {
  return signals.some((signal) =>
    signal.type === type &&
    signal.polarity === polarity &&
    (!signal.subject || signal.subject === "venue")
  );
}

function preferenceBonus(
  preferences: string[],
  item: { reviewSignals: ReviewSignal[]; facilities: { type: string; distance_m?: number }[] }
): number {
  let bonus = 0;
  if (preferences.includes("장애인화장실")) {
    if (hasSignal(item.reviewSignals, "restroom")) bonus += 10;
    const restroom = item.facilities.find((facility) => facility.type === "accessible_restroom");
    if (restroom?.distance_m !== undefined) bonus += restroom.distance_m <= 300 ? 10 : 5;
  }
  if (preferences.includes("충전기근처")) {
    const charger = item.facilities.find((facility) => facility.type === "wheelchair_charger");
    if (charger?.distance_m !== undefined) bonus += charger.distance_m <= 500 ? 10 : 5;
  }
  if (preferences.includes("엘리베이터") && hasSignal(item.reviewSignals, "elevator")) bonus += 10;
  return bonus;
}

function allocations(total: number): { local: number; broad: number; review: number } {
  const normalized = Math.max(1, Math.floor(total));
  const local = Math.min(normalized, Math.max(2, Math.floor(normalized * 0.2)));
  // Broad evidence rescues places absent from a nearest-only Kakao pool. Give
  // it retry headroom; exact-place verification can reuse discovery evidence
  // and therefore needs fewer duplicate requests.
  const broad = Math.min(normalized - local, Math.max(2, Math.floor(normalized * 0.3)));
  return { local, broad, review: Math.max(0, normalized - local - broad) };
}

function candidateBudgetLimits(total: number, count: number): number[] {
  let remaining = Math.max(0, Math.floor(total));
  return Array.from({ length: count }, (_, index) => {
    const remainingCandidates = count - index;
    const limit = remainingCandidates > 0 ? Math.floor(remaining / remainingCandidates) : 0;
    remaining -= limit;
    return limit;
  });
}

const MINIMUM_RESULT_TARGET = 3;
const INITIAL_REVIEW_BATCH_SIZE = 5;
const MAX_REVIEW_QUERIES_PER_CANDIDATE = 3;

function interpretation(intent: ResolvedSearchIntent, extraWarnings: string[]): QueryInterpretation {
  return {
    location: intent.location,
    scope: intent.scope,
    category: intent.category,
    radius_m: intent.radiusM,
    preferences: intent.preferences,
    unsupported_preferences: intent.unsupportedPreferences,
    content_preferences: intent.contentPreferences,
    content_term_source: intent.contentTermSource,
    hard_content_filter: intent.hardContentFilter,
    search_warnings: [...intent.warnings, ...extraWarnings]
  };
}

export async function runRecommendationEngine(
  input: RecommendIntentInput,
  config: AppConfig,
  dependencies: RecommendationEngineDependencies = {}
): Promise<Record<string, unknown>> {
  const intent = resolveSearchIntent(input, {
    defaultRadiusM: config.defaultRadiusM,
    defaultLimit: config.defaultLimit
  });
  const allocation = allocations(config.maxExternalApiCallsPerRequest);
  const localBudget = new RequestBudget(allocation.local);
  const broadBudget = new RequestBudget(allocation.broad);
  const placeClient = dependencies.createPlaceClient?.(config, localBudget) ?? new KakaoLocalClient(config, localBudget);
  const publicData = dependencies.createPublicDataClient?.(config) ?? new PublicDataClient(config);
  const origin = await placeClient.resolveLocation(intent.location);

  let poolResult = {
    candidates: [],
    diagnostics: {
      strategies: {},
      raw_count: 0,
      category_matched_count: 0,
      area_matched_count: 0,
      content_matched_count: 0,
      hard_content_filter_applied: false,
      hard_content_filtered_count: 0,
      content_relaxed: false
    }
  } as Awaited<ReturnType<typeof buildCandidatePool>>;
  if (originIsResolved(origin)) {
    poolResult = await buildCandidatePool({
      intent,
      origin,
      provider: placeClient,
      poolLimit: Math.max(15, config.maxPlaceCandidates)
    });
  }

  const broadReview = dependencies.createReviewService?.(config, broadBudget) ?? new ReviewSearchService(config, broadBudget);
  const broadResult = originIsResolved(origin) && broadBudget.limit > 0
    ? await attachBroadAccessibilityEvidence({
      intent,
      origin,
      candidates: poolResult.candidates,
      reviewSearch: broadReview,
      placeProvider: placeClient,
      maxCalls: broadBudget.limit,
      maxLookups: localBudget.remaining
    })
    : {
      candidates: poolResult.candidates,
      diagnostics: {
        queries: [],
        calls: 0,
        results: 0,
        matched_candidates: 0,
        matched_evidence: 0,
        unavailable_calls: 0,
        unavailable_sources: {},
        lookup_calls: 0,
        lookup_terms: [],
        discovered_candidates: 0,
        discovered_places: []
      }
    };

  const resultTarget = Math.min(intent.limit, MINIMUM_RESULT_TARGET);
  const candidatesToAnalyze = broadResult.candidates.slice(0, config.maxPlaceCandidates);
  const analyzedCandidates: Array<{ ranked: RankedPlace; budget: RequestBudgetSnapshot }> = [];
  let nextCandidateIndex = 0;
  let reviewBudgetUsed = 0;

  while (nextCandidateIndex < candidatesToAnalyze.length && reviewBudgetUsed < allocation.review) {
    const verifiedCount = partitionRankedPlaces(
      analyzedCandidates.map((item) => item.ranked),
      false
    ).recommendations.length;
    if (analyzedCandidates.length > 0 && verifiedCount >= resultTarget) break;

    const remainingBudget = allocation.review - reviewBudgetUsed;
    const remainingCandidates = candidatesToAnalyze.length - nextCandidateIndex;
    const desiredBatchSize = analyzedCandidates.length === 0
      ? Math.max(resultTarget, Math.min(INITIAL_REVIEW_BATCH_SIZE, config.maxPlaceCandidates))
      : config.reviewCandidateConcurrency;
    const batchSize = Math.min(desiredBatchSize, remainingCandidates, remainingBudget);
    if (batchSize <= 0) break;

    const batch = candidatesToAnalyze.slice(nextCandidateIndex, nextCandidateIndex + batchSize);
    const batchBudgetTotal = Math.min(
      remainingBudget,
      batch.length * MAX_REVIEW_QUERIES_PER_CANDIDATE
    );
    const budgetLimits = candidateBudgetLimits(batchBudgetTotal, batch.length);
    const batchResults = await mapWithConcurrency(
      batch,
      config.reviewCandidateConcurrency,
      async (place, index): Promise<{ ranked: RankedPlace; budget: RequestBudgetSnapshot }> => {
        const candidateBudgetLimit = budgetLimits[index] ?? 0;
        const candidateBudget = new RequestBudget(candidateBudgetLimit);
        const reviewSearch = dependencies.createReviewService?.(config, candidateBudget) ??
          new ReviewSearchService(config, candidateBudget);
        const review = await reviewSearch.analyzePlace(
          place,
          intent.scope === "point" ? intent.location : undefined,
          intent.preferences,
          Math.min(MAX_REVIEW_QUERIES_PER_CANDIDATE, candidateBudgetLimit)
        );
        const supportFacilities = publicData.findNearbySupportFacilities(
          place,
          "all",
          intent.radiusM,
          4,
          place.roadAddress ?? place.address
        );
        const publicEvidence = [
          ...publicData.findMatchingAccessibilityEvidence(place),
          ...supportEvidenceFromFacilities(supportFacilities)
        ];
        const supportGrade = officialSupportGrade(publicEvidence);
        const supportScore = officialSupportScore(publicEvidence);
        const preferenceScore = preferenceBonus(intent.preferences, {
          reviewSignals: [...review.positive_signals, ...review.negative_signals, ...review.ambiguous_signals],
          facilities: supportFacilities
        });
        return {
          ranked: {
            place,
            review,
            official_support_grade: supportGrade,
            recommendation_status: recommendationStatus(review.review_signal_grade, supportGrade),
            ranking_score: calculateRankingScore(
              review.review_signal_grade,
              review.review_signal_score,
              supportGrade,
              supportScore
            ) + preferenceScore,
            official_support_score: supportScore,
            public_support_evidence: publicEvidence,
            support_facilities_nearby: supportFacilities
          },
          budget: candidateBudget.snapshot()
        };
      }
    );
    analyzedCandidates.push(...batchResults);
    reviewBudgetUsed += batchResults.reduce((sum, item) => sum + item.budget.used, 0);
    nextCandidateIndex += batch.length;
  }
  const ranked = analyzedCandidates.map((item) => item.ranked);
  const reviewBudgetSnapshots = analyzedCandidates.map((item) => item.budget);

  const partitions = partitionRankedPlaces(ranked, false);
  const recommendations = sortRankedPlaces(partitions.recommendations).slice(0, intent.limit);
  const verificationShortfall = Math.max(0, resultTarget - recommendations.length);
  const fallbackRecommendations = sortRankedPlaces(partitions.unverified).slice(0, verificationShortfall);
  const reviewPositiveCount = recommendations.filter((item) =>
    item.review.review_signal_grade === "R1" || item.review.review_signal_grade === "R2"
  ).length;
  const candidateFallbackReason = !config.kakaoRestApiKey
    ? "kakao_local_credentials_missing"
    : !originIsResolved(origin)
      ? "location_unresolved"
      : poolResult.candidates.length === 0
        ? poolResult.diagnostics.hard_content_filter_applied && poolResult.diagnostics.area_matched_count > 0
          ? "content_preference_filtered_all_candidates"
          : "kakao_local_unavailable_or_no_candidates"
        : "no_review_positive_candidates";
  const belowTargetReason = fallbackReasonForReviewResults(reviewPositiveCount, intent.limit);
  let fallbackReason: string | null;
  if (recommendations.length > 0) {
    fallbackReason = belowTargetReason;
  } else if (analyzedCandidates.length === 0) {
    fallbackReason = candidateFallbackReason;
  } else {
    fallbackReason = belowTargetReason ?? "no_review_positive_candidates";
  }
  const extraWarnings = poolResult.diagnostics.content_relaxed
    ? ["content_preference_relaxed_because_no_matching_place_was_found"]
    : [];
  const response = buildRecommendResponse({
    interpretation: interpretation(intent, extraWarnings),
    origin: origin as Origin,
    recommendations,
    notRecommended: partitions.notRecommended,
    unverified: partitions.unverified,
    fallbackUsed: fallbackRecommendations.length > 0,
    fallbackReason,
    fallbackRecommendations
  });
  return {
    ...response,
    search_architecture: "place_first_evidence_second_v2",
    candidate_pipeline: {
      ...poolResult.diagnostics,
      broad_evidence: broadResult.diagnostics,
      analyzed_candidates: analyzedCandidates.length,
      verified_recommendations: recommendations.length,
      verification_required_candidates: fallbackRecommendations.length
    },
    request_budget: {
      limit: config.maxExternalApiCallsPerRequest,
      used: localBudget.used + broadBudget.used + reviewBudgetUsed,
      allocations: {
        local: localBudget.snapshot(),
        broad_evidence: broadBudget.snapshot(),
        review: {
          limit: allocation.review,
          used: reviewBudgetUsed,
          candidates: reviewBudgetSnapshots
        }
      }
    }
  };
}
