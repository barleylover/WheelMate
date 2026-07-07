import type { AppConfig } from "../../config.js";
import { KakaoLocalClient } from "../../clients/kakaoLocalClient.js";
import { PublicDataClient } from "../../clients/publicDataClient.js";
import { normalizeCategory } from "../../core/categoryMapper.js";
import { fallbackReasonForReviewResults } from "../../core/fallback.js";
import {
  officialSupportGrade,
  officialSupportScore,
  supportEvidenceFromFacilities
} from "../../core/publicEvidence.js";
import { ReviewSearchService } from "../../reviewSearch/reviewSearchService.js";
import { buildRecommendResponse } from "../../reviewSearch/reviewResponseBuilder.js";
import {
  discoverPlaceCandidatesByBroadReviewSearch,
  mergePlaceCandidates
} from "../../reviewSearch/broadCandidateDiscovery.js";
import {
  calculateRankingScore,
  partitionRankedPlaces,
  recommendationStatus,
  sortRankedPlaces
} from "../../reviewSearch/reviewRanking.js";
import { splitPreferences } from "../../reviewSearch/queryBuilder.js";
import type { Category, RankedPlace, ReviewSignal } from "../../types.js";

export interface RecommendAccessiblePlacesInput {
  query?: string;
  location: string;
  category?: Category;
  radius_m?: number;
  limit?: number;
  preferences?: string[];
}

function hasSignal(signals: ReviewSignal[], type: string, polarity = "positive"): boolean {
  return signals.some((signal) => signal.type === type && signal.polarity === polarity);
}

function preferenceBonus(
  preferences: string[],
  item: {
    reviewSignals: ReviewSignal[];
    facilities: { type: string; distance_m?: number }[];
  }
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
  if (preferences.includes("엘리베이터")) {
    if (hasSignal(item.reviewSignals, "elevator")) bonus += 10;
  }
  return bonus;
}

function contentSearchPreferences(preferences: string[]): string[] {
  const generic = new Set(["조용한", "분위기", "분위기좋은", "넓은", "맛있는", "좋은"]);
  return preferences
    .map((preference) => preference.trim())
    .filter((preference) => preference.length >= 2 && !generic.has(preference))
    .slice(0, 3);
}

function placeMatchesContentPreferences(place: { name: string; category: string | Category; searchAliases?: string[]; discoveryEvidence?: Array<{ title: string; snippet: string }> }, preferences: string[]): boolean {
  if (preferences.length === 0) return true;
  const text = [
    place.name,
    String(place.category),
    ...(place.searchAliases ?? []),
    ...(place.discoveryEvidence ?? []).flatMap((evidence) => [evidence.title, evidence.snippet])
  ].join(" ");
  return preferences.some((preference) => text.includes(preference));
}

export async function recommendAccessiblePlacesByReviewSearch(
  input: RecommendAccessiblePlacesInput,
  config: AppConfig
): Promise<Record<string, unknown>> {
  const category = normalizeCategory(input.category);
  const radiusM = input.radius_m ?? config.defaultRadiusM;
  const limit = input.limit ?? config.defaultLimit;
  const { supported: preferences, unsupported: unsupportedPreferences } = splitPreferences(input.preferences ?? []);
  const contentPreferences = contentSearchPreferences(unsupportedPreferences);
  const searchPreferences = [...preferences, ...contentPreferences];
  const interpretation = {
    location: input.location,
    category,
    radius_m: radiusM,
    preferences,
    unsupported_preferences: unsupportedPreferences
  };

  const kakaoLocal = new KakaoLocalClient(config);
  const publicData = new PublicDataClient(config);
  const reviewSearch = new ReviewSearchService(config);
  const origin = await kakaoLocal.resolveLocation(input.location);
  const candidateLimit = Math.min(Math.max(limit * 2, 1), config.maxPlaceCandidates);
  const [discoveredCandidates, localCandidates] = await Promise.all([
    discoverPlaceCandidatesByBroadReviewSearch({
      config,
      kakaoLocal,
      origin,
      location: input.location,
      category,
      radiusM,
      preferences: searchPreferences,
      limit: Math.min(limit, config.maxPlaceCandidates)
    }),
    kakaoLocal.searchNearbyPlaces(input.location, origin, category, radiusM, candidateLimit)
  ]);
  const mergedCandidates = mergePlaceCandidates(discoveredCandidates, localCandidates);
  const preferenceMatchedCandidates = contentPreferences.length > 0
    ? mergedCandidates.filter((place) => placeMatchesContentPreferences(place, contentPreferences))
    : mergedCandidates;
  const candidates = preferenceMatchedCandidates.slice(
    0,
    Math.min(Math.max(limit, 1), 5)
  );

  const ranked: RankedPlace[] = [];
  for (const place of candidates) {
    const reviewQueryLimit = (place.discoveryEvidence?.length ?? 0) > 0 ? 0 : 3;
    const review = await reviewSearch.analyzePlace(place, input.location, searchPreferences, reviewQueryLimit);
    const supportFacilities = publicData.findNearbySupportFacilities(
      { lat: place.lat, lng: place.lng },
      "all",
      radiusM,
      4
    );
    const publicEvidence = [
      ...publicData.findMatchingAccessibilityEvidence(place),
      ...supportEvidenceFromFacilities(supportFacilities)
    ];
    const supportGrade = officialSupportGrade(publicEvidence);
    const supportScore = officialSupportScore(publicEvidence);
    const preferenceScore = preferenceBonus(preferences, {
      reviewSignals: [...review.positive_signals, ...review.negative_signals, ...review.ambiguous_signals],
      facilities: supportFacilities
    });
    const rankingScore =
      calculateRankingScore(review.review_signal_grade, review.review_signal_score, supportGrade, supportScore) +
      preferenceScore;
    ranked.push({
      place,
      review,
      official_support_grade: supportGrade,
      recommendation_status: recommendationStatus(review.review_signal_grade, supportGrade),
      ranking_score: rankingScore,
      official_support_score: supportScore,
      public_support_evidence: publicEvidence,
      support_facilities_nearby: supportFacilities
    });
  }

  const includeUnverified = Boolean(input.query?.includes("근거가 없어도") || input.query?.includes("후보를 보여"));
  const partitions = partitionRankedPlaces(ranked, includeUnverified);
  const recommendations = sortRankedPlaces(partitions.recommendations).slice(0, limit);
  const reviewPositiveCount = recommendations.filter((item) =>
    ["R1", "R2"].includes(item.review.review_signal_grade)
  ).length;
  const fallbackReason =
    candidates.length === 0
      ? "kakao_local_unavailable_or_no_candidates"
      : category === "cafe" || category === "restaurant"
        ? fallbackReasonForReviewResults(reviewPositiveCount, limit)
        : null;

  return buildRecommendResponse({
    interpretation,
    origin,
    recommendations,
    notRecommended: partitions.notRecommended,
    unverified: partitions.unverified,
    fallbackUsed: false,
    fallbackReason,
    fallbackRecommendations: []
  });
}
