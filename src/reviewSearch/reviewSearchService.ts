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
import { buildReviewQueries } from "./queryBuilder.js";
import { calculatePlaceRelevance, placeToRelevanceContext } from "./placeRelevance.js";
import { extractSignals } from "./signalExtractor.js";
import { scoreReviewEvidence } from "./signalScoring.js";
import { enabledSearchSources, sourceAttribution } from "./sourceRouter.js";

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

  constructor(private readonly config: AppConfig) {
    this.naver = new NaverSearchClient(config);
    this.daum = new DaumSearchClient(config);
  }

  async searchPlaceAccessibilityReviews(input: SearchPlaceReviewsInput): Promise<ReviewAnalysis> {
    const place: PlaceCandidate = {
      name: input.place_name,
      address: input.address,
      category: input.category ?? "any",
      lat: 0,
      lng: 0
    };
    return this.analyzePlace(place, input.neighborhood, [], input.limit ?? this.config.defaultLimit);
  }

  async analyzePlace(
    place: PlaceCandidate,
    neighborhood?: string,
    preferences: string[] = [],
    maxQueries = 3
  ): Promise<ReviewAnalysis> {
    const primaryQueries = buildReviewQueries(
      {
        placeName: place.name,
        neighborhood,
        district: undefined,
        addressToken: undefined,
        category: place.category,
        preferences
      },
      maxQueries
    );
    const aliasQueries = (place.searchAliases ?? [])
      .slice(0, 2)
      .flatMap((alias) =>
        buildReviewQueries(
          {
            placeName: alias,
            neighborhood,
            district: undefined,
            addressToken: undefined,
            category: place.category,
            preferences
          },
          3
        )
      );
    const queries = [...new Set([...aliasQueries, ...primaryQueries])].slice(0, maxQueries);
    const sources = enabledSearchSources(this.config);
    const outcomes = await this.runSearches(queries, sources);
    const relevanceContext = placeToRelevanceContext(place, neighborhood);
    const evidence: ReviewEvidence[] = outcomes
      .flatMap((outcome) => outcome.results)
      .map((result) => ({
        ...result,
        place_match_score: calculatePlaceRelevance(result, relevanceContext),
        signals: extractSignals(result)
      }))
      .filter((result) => result.place_match_score >= 0.45 && result.signals.length > 0)
      .map((result) => {
        if (result.place_match_score < 0.65) {
          return {
            ...result,
            signals: result.signals.map((signal) => ({
              ...signal,
              strength: signal.strength === "strong" ? "medium" : signal.strength
            }))
          };
        }
        return result;
      });

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
      searched_sources: sources,
      source_counts: sourceCounts,
      unavailable_sources: unavailableSources,
      cautions: [
        "검색 결과 요약문 기준 참고 신호이며 공식 접근성 정보가 아닙니다.",
        "블로그/카페 본문 전체를 분석한 결과가 아닙니다."
      ],
      attribution: sourceAttribution(sources)
    };
  }

  private async runSearches(queries: string[], sources: SearchSource[]): Promise<SourceSearchOutcome[]> {
    const calls: Array<Promise<SourceSearchOutcome>> = [];
    for (const query of queries) {
      for (const source of sources) {
        if (calls.length >= this.config.maxReviewSearchCalls) break;
        calls.push(this.searchSource(source, query));
      }
      if (calls.length >= this.config.maxReviewSearchCalls) break;
    }
    const settled = await Promise.allSettled(calls);
    return settled.map((result, index) => {
      if (result.status === "fulfilled") return result.value;
      const source = sources[index % Math.max(1, sources.length)] ?? "naver_blog";
      return {
        source,
        query: queries[Math.floor(index / Math.max(1, sources.length))] ?? "",
        results: [],
        unavailable: true,
        error: "search_call_rejected"
      };
    });
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
