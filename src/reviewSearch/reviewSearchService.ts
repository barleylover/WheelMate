import type { AppConfig } from "../config.js";
import { DaumSearchClient } from "../clients/daumSearchClient.js";
import { NaverSearchClient } from "../clients/naverSearchClient.js";
import type {
  PlaceCandidate,
  ReviewAnalysis,
  ReviewEvidence,
  SearchSource,
  SourceSearchOutcome
} from "../types.js";
import { clampInteger, MAX_REVIEW_RESULT_LIMIT } from "../core/inputLimits.js";
import { mapWithConcurrency } from "../utils/concurrency.js";
import type { RequestBudget, RequestBudgetSnapshot } from "../utils/requestBudget.js";
import { buildReviewQueries, buildReviewQueryContext } from "./queryBuilder.js";
import { assessPlaceRelevance, placeEvidenceIsRecommendationSafe, placeToRelevanceContext } from "./placeRelevance.js";
import { extractSignals } from "./signalExtractor.js";
import { scoreReviewEvidence } from "./signalScoring.js";
import { enabledSearchSources, sourceAttribution } from "./sourceRouter.js";
import { evidenceIdentity } from "./evidenceIdentity.js";
import { buildBalancedSearchCalls, logicalSearchCallLimit } from "../search/searchCallPlanner.js";

export interface SearchPlaceReviewsInput {
  place_name: string;
  address?: string;
  neighborhood?: string;
  category?: string;
  limit?: number;
}

export class ReviewSearchService {
  private readonly naver: NaverSearchClient;
  private readonly daum: DaumSearchClient;

  constructor(
    private readonly config: AppConfig,
    private readonly budget?: RequestBudget
  ) {
    this.naver = new NaverSearchClient(config, budget);
    this.daum = new DaumSearchClient(config, budget);
  }

  async searchPlaceAccessibilityReviews(input: SearchPlaceReviewsInput): Promise<ReviewAnalysis> {
    const place: PlaceCandidate = {
      name: input.place_name,
      address: input.address,
      category: input.category ?? "any",
      lat: 0,
      lng: 0
    };
    const resultLimit = clampInteger(input.limit, this.config.defaultLimit, 1, MAX_REVIEW_RESULT_LIMIT);
    const analysis = await this.analyzePlace(place, input.neighborhood, [], 3);
    return {
      ...analysis,
      results: analysis.results.slice(0, resultLimit)
    };
  }

  async analyzePlace(
    place: PlaceCandidate,
    neighborhood?: string,
    preferences: string[] = [],
    maxQueries = 3
  ): Promise<ReviewAnalysis> {
    const boundedMaxQueries = clampInteger(maxQueries, 3, 0, 5);
    const primaryQueries = buildReviewQueries(
      buildReviewQueryContext(place, neighborhood, preferences),
      boundedMaxQueries
    );
    // searchAliases contain discovery/content hints, not guaranteed venue-name
    // aliases. Using them as the place name produced generic queries such as
    // "횟집 휠체어" and then attached unrelated results to a concrete venue.
    const queries = [...new Set(primaryQueries)].slice(0, boundedMaxQueries);
    const outcomes = await this.searchQueries(queries);
    const searchedSources = [...new Set(outcomes.map((outcome) => outcome.source))];
    const relevanceContext = placeToRelevanceContext(place, neighborhood);
    const fetchedEvidence: ReviewEvidence[] = outcomes
      .flatMap((outcome) => outcome.results)
      .map((result) => {
        const relevance = assessPlaceRelevance(result, relevanceContext);
        return {
          ...result,
          place_match_score: relevance.score,
          place_name_match: relevance.name_match,
          place_matched_name: relevance.matched_name,
          place_matched_field: relevance.matched_field,
          place_location_match: relevance.location_match,
          place_location_required: relevance.location_required,
          signals: extractSignals(result)
        };
      })
      .filter((result) =>
        result.place_match_score >= 0.45 &&
        result.signals.length > 0 &&
        placeEvidenceIsRecommendationSafe(result, {
          score: result.place_match_score,
          name_match: result.place_name_match,
          matched_name: result.place_matched_name,
          matched_field: result.place_matched_field,
          location_match: result.place_location_match,
          location_required: result.place_location_required ?? false
        }, result.signals)
      )
      .map((result) => {
        const attributed = { ...result, attribution_verified: true as const };
        if (result.place_match_score < 0.65) {
          return {
            ...attributed,
            signals: result.signals.map((signal) => ({
              ...signal,
              strength: signal.strength === "strong" ? "medium" : signal.strength
            }))
          };
        }
        return attributed;
      });
    const evidence = this.uniqueEvidence([...(place.discoveryEvidence ?? []), ...fetchedEvidence]);

    const score = scoreReviewEvidence(evidence);
    const sourceCounts = this.emptySourceCounts();
    for (const outcome of outcomes) {
      sourceCounts[outcome.source] += outcome.results.length;
    }
    const unavailableSources: ReviewAnalysis["unavailable_sources"] = {};
    for (const outcome of outcomes) {
      if (outcome.unavailable) {
        unavailableSources[outcome.source] = outcome.error ?? "unavailable";
      }
    }

    return {
      place_name: place.name,
      address: place.roadAddress ?? place.address,
      queries_used: queries,
      review_signal_grade: score.grade,
      review_signal_score: score.score,
      positive_signals: score.positive,
      negative_signals: score.negative,
      ambiguous_signals: score.ambiguous,
      results: evidence,
      searched_sources: searchedSources,
      source_counts: sourceCounts,
      unavailable_sources: unavailableSources,
      cautions: [
        "검색 결과 요약문 기준 참고 신호이며 공식 접근성 정보가 아닙니다.",
        "블로그/카페 본문 전체를 분석한 결과가 아닙니다."
      ],
      attribution: sourceAttribution(searchedSources)
    };
  }

  private uniqueEvidence(evidence: ReviewEvidence[]): ReviewEvidence[] {
    const seen = new Set<string>();
    return evidence.filter((item) => {
      const key = evidenceIdentity(item);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  async searchQueries(queries: string[], maxCalls = this.config.maxReviewSearchCalls): Promise<SourceSearchOutcome[]> {
    const sources = enabledSearchSources(this.config);
    const logicalCallLimit = logicalSearchCallLimit(maxCalls, this.budget?.remaining);
    const calls = buildBalancedSearchCalls(queries, sources, logicalCallLimit);
    const indexedCalls = calls.map((call, index) => ({ ...call, index }));
    const outcomes: Array<SourceSearchOutcome | undefined> = new Array(calls.length);
    const runProviderQueue = async (provider: "naver" | "daum"): Promise<void> => {
      const providerCalls = indexedCalls.filter((call) => call.source.startsWith(`${provider}_`));
      await mapWithConcurrency(providerCalls, 1, async ({ source, query, index }) => {
        try {
          outcomes[index] = await this.searchSource(source, query);
        } catch {
          outcomes[index] = {
            source,
            query,
            results: [],
            unavailable: true,
            error: "search_call_rejected"
          };
        }
      });
    };
    // Providers run in parallel, while each provider queue is serialized to
    // avoid self-inflicted burst throttling.
    await Promise.all([runProviderQueue("naver"), runProviderQueue("daum")]);
    return outcomes.filter((outcome): outcome is SourceSearchOutcome => Boolean(outcome));
  }

  budgetSnapshot(): RequestBudgetSnapshot | null {
    return this.budget?.snapshot() ?? null;
  }

  private searchSource(source: SearchSource, query: string): Promise<SourceSearchOutcome> {
    if (source.startsWith("naver_")) return this.naver.searchSource(source, query);
    return this.daum.searchSource(source, query);
  }

  private emptySourceCounts(): Record<SearchSource, number> {
    return {
      naver_blog: 0,
      naver_cafe: 0,
      naver_web: 0,
      daum_blog: 0,
      daum_cafe: 0,
      daum_web: 0
    };
  }
}
