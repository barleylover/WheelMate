import type { AppConfig } from "../../config.js";
import { KakaoLocalClient } from "../../clients/kakaoLocalClient.js";
import { PublicDataClient } from "../../clients/publicDataClient.js";
import { distanceMeters } from "../../core/distance.js";
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
import type { Category, Origin, PlaceCandidate, RankedPlace, ReviewSignal } from "../../types.js";

export interface RecommendAccessiblePlacesInput {
  query?: string;
  location?: string;
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

const ACCESSIBILITY_OR_GENERIC_TERMS = new Set([
  "휠체어",
  "전동휠체어",
  "휠체어가능",
  "휠체어이용",
  "휠체어접근",
  "장애인",
  "접근성",
  "접근",
  "출입",
  "입장",
  "이용",
  "가능",
  "이용가능",
  "출입가능",
  "접근가능",
  "무장애",
  "배리어프리",
  "베리어프리",
  "문턱",
  "단차",
  "경사로",
  "슬로프",
  "계단",
  "엘리베이터",
  "엘베",
  "승강기",
  "화장실",
  "장애인화장실",
  "유모차",
  "조용한",
  "분위기",
  "분위기좋은",
  "넓은",
  "맛있는",
  "좋은",
  "근처",
  "주변",
  "인근",
  "부근",
  "추천",
  "추천좀",
  "추천해줘",
  "찾아줘",
  "가야해",
  "갈만한",
  "가기좋은",
  "타고",
  "장소",
  "곳",
  "가게",
  "음식점",
  "식당",
  "카페"
]);

const CONTENT_SYNONYMS: Record<string, string[]> = {
  햄버거: ["햄버거", "버거"],
  버거: ["버거", "햄버거"],
  횟집: ["횟집", "회", "생선회"],
  회: ["회", "횟집", "생선회"],
  생선회: ["생선회", "횟집", "회"],
  해산물: ["해산물", "해물"],
  해물: ["해물", "해산물"],
  초밥: ["초밥", "스시"],
  스시: ["스시", "초밥"],
  베이커리: ["베이커리", "빵집"],
  빵집: ["빵집", "베이커리"],
  돈까스: ["돈까스", "돈가스"],
  돈가스: ["돈가스", "돈까스"],
  쌀국수: ["쌀국수", "베트남"],
  고깃집: ["고깃집", "고기", "구이"],
  고기집: ["고기집", "고기", "구이"],
  중국집: ["중국집", "중식"],
  치킨집: ["치킨집", "치킨"],
  타코집: ["타코집", "타코"],
  비건: ["비건", "채식"],
  채식: ["채식", "비건"]
};

const CONTENT_OR_CATEGORY_TERMS = [
  "장애인 화장실",
  "전동휠체어 충전기",
  "생선회",
  "해산물",
  "횟집",
  "해물",
  "마라탕",
  "라멘",
  "라면",
  "초밥",
  "스시",
  "포케",
  "파스타",
  "피자",
  "햄버거",
  "버거",
  "샌드위치",
  "샐러드",
  "베이커리",
  "빵집",
  "디저트",
  "브런치",
  "한식",
  "중식",
  "일식",
  "양식",
  "분식",
  "삼겹살",
  "갈비",
  "국밥",
  "칼국수",
  "냉면",
  "김밥",
  "떡볶이",
  "비건",
  "채식",
  "고깃집",
  "고기집",
  "중국집",
  "치킨집",
  "타코집",
  "타코",
  "브리또",
  "약국",
  "병원",
  "서점",
  "영화관",
  "공연장",
  "도서관",
  "미술관",
  "박물관",
  "전시관",
  "쇼핑몰",
  "백화점",
  "마트",
  "편의점",
  "은행",
  "미용실",
  "헬스장",
  "카페",
  "음식점",
  "식당",
  "맛집",
  "화장실",
  "충전기"
];

const EXACT_CONTENT_TERMS = new Set([
  "횟집",
  "고깃집",
  "고기집",
  "중국집",
  "치킨집",
  "타코집",
  "빵집"
]);

const ALLOWED_SHORT_CONTENT_TERMS = new Set(["회"]);

function normalizeContentTerm(preference: string): string {
  const compact = preference
    .trim()
    .replace(/\s+/g, "");
  if (EXACT_CONTENT_TERMS.has(compact)) return compact;
  return compact
    .replace(/(?:으로|로)?(?:갈만한|가기좋은|접근가능한|이용가능한)$/g, "")
    .replace(/(?:맛집|전문점|집|가게)$/g, "");
}

function expandContentTerm(term: string): string[] {
  return CONTENT_SYNONYMS[term] ?? [term];
}

export function contentSearchPreferences(preferences: string[]): string[] {
  const terms = preferences
    .map(normalizeContentTerm)
    .filter((preference) =>
      (preference.length >= 2 || ALLOWED_SHORT_CONTENT_TERMS.has(preference)) &&
      !ACCESSIBILITY_OR_GENERIC_TERMS.has(preference)
    );
  return [...new Set(terms.flatMap(expandContentTerm))].slice(0, 4);
}

function compactText(value: string): string {
  return value.replace(/\s+/g, "");
}

function cleanLocationCandidate(value: string): string | undefined {
  const cleaned = value
    .replace(/[?!.,]/g, " ")
    .replace(/(?:근처|주변|인근|부근|쪽|에서|으로|로|에|의)\s*$/g, " ")
    .replace(/휠체어(?:를|로)?\s*(?:타고|이용해서|이용하여)?/g, " ")
    .replace(/(?:근처|주변|인근|부근|쪽)/g, " ")
    .replace(/(?:휠체어|전동휠체어|장애인|접근성|접근|출입|입장|이용|가능한|가능|갈만한|가기좋은|조용한|분위기|넓은|맛있는|좋은|추천|찾아줘|추천좀|추천해줘)/g, " ")
    .replace(/\b한\b/g, " ")
    .replace(/(?:근처|주변|인근|부근|쪽|에서|으로|로|에|의)\s*$/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned || cleaned.length < 2) return undefined;
  return cleaned;
}

export function inferLocationFromQuery(query?: string): string | undefined {
  if (!query) return undefined;
  const normalized = query.replace(/\s+/g, " ").trim();
  const keywordPositions = CONTENT_OR_CATEGORY_TERMS
    .map((term) => normalized.indexOf(term))
    .filter((index) => index > 0);
  if (keywordPositions.length > 0) {
    const beforeTarget = normalized.slice(0, Math.min(...keywordPositions));
    const cleaned = cleanLocationCandidate(beforeTarget);
    if (cleaned) return cleaned;
  }

  const suffixMatch = normalized.match(
    /([가-힣A-Za-z0-9]+(?:\s+[가-힣A-Za-z0-9]+){0,4}?(?:역|동|구|시|군|도|읍|면|리|공항|터미널|시장|마을|광장|캠퍼스|대학교|해수욕장|공원|궁|몰|백화점))/
  );
  return cleanLocationCandidate(suffixMatch?.[1] ?? "");
}

function resolveInputLocation(inputLocation: string | undefined, query?: string): string {
  const explicit = inputLocation?.trim();
  const inferred = inferLocationFromQuery(query);
  if (inferred) return inferred;
  if (explicit) return explicit;
  throw new Error("location is required or must be inferable from query");
}

export function inferCategoryFromQuery(query: string | undefined, fallback: Category): Category {
  if (!query) return fallback;
  if (/장애인\s*화장실|화장실/.test(query)) return "restroom";
  if (/전동휠체어\s*충전|충전기/.test(query)) return "charger";
  if (/박물관|미술관/.test(query)) return "museum";
  if (/영화관|공연장|도서관|전시관/.test(query)) return "culture";
  if (/카페|커피|베이커리|빵집|디저트|브런치/.test(query)) return "cafe";
  if (
    /음식점|식당|맛집|횟집|생선회|해산물|해물|(?:^|\s)회(?:\s|$)|마라탕|라멘|라면|초밥|스시|포케|파스타|피자|햄버거|버거|샌드위치|샐러드|한식|중식|일식|양식|분식|삼겹살|갈비|국밥|칼국수|냉면|김밥|떡볶이|고깃집|고기집|중국집|치킨집|타코|브리또|비건|채식/.test(query)
  ) {
    return "restaurant";
  }
  return fallback;
}

const CONCRETE_CONTENT_TERMS = [
  "생선회",
  "해산물",
  "횟집",
  "해물",
  "마라탕",
  "라멘",
  "라면",
  "초밥",
  "스시",
  "포케",
  "파스타",
  "피자",
  "햄버거",
  "버거",
  "샌드위치",
  "샐러드",
  "베이커리",
  "빵집",
  "디저트",
  "브런치",
  "한식",
  "중식",
  "일식",
  "양식",
  "분식",
  "삼겹살",
  "갈비",
  "국밥",
  "칼국수",
  "냉면",
  "김밥",
  "떡볶이",
  "고깃집",
  "고기집",
  "고기",
  "치킨집",
  "치킨",
  "중국집",
  "타코집",
  "타코",
  "브리또",
  "비건",
  "채식",
  "약국",
  "병원",
  "서점",
  "영화관",
  "공연장",
  "도서관",
  "미술관",
  "박물관",
  "전시관",
  "쇼핑몰",
  "백화점",
  "마트",
  "편의점",
  "은행",
  "미용실",
  "헬스장",
  "공원"
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripQueryToPotentialTargets(query: string, location?: string): string {
  let stripped = query.replace(/[?!.,]/g, " ");
  if (location) {
    stripped = stripped.replace(new RegExp(escapeRegExp(location), "g"), " ");
    stripped = stripped.replace(new RegExp(escapeRegExp(location.replace(/\s+/g, "")), "g"), " ");
  }
  return stripped
    .replace(/휠체어(?:를|로)?\s*(?:타고|이용해서|이용하여)?/g, " ")
    .replace(/전동휠체어/g, " ")
    .replace(/(?:장애인|접근성|접근|출입|입장|이용|가능한|가능|갈만한|가기좋은|추천해줘|추천좀|추천|찾아줘|가야해|해줘|타고|근처|주변|인근|부근|쪽|에서|으로|로|에|의|좀|좋은|맛있는|넓은|조용한|분위기)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function inferFreeformContentTermsFromQuery(query: string, location?: string): string[] {
  const stripped = stripQueryToPotentialTargets(query, location);
  if (!stripped) return [];
  const tokenTerms = stripped.split(/\s+/).filter(Boolean);
  const phrase = tokenTerms.join(" ");
  return uniqueContentTerms([phrase, ...tokenTerms].filter((term) => !ACCESSIBILITY_OR_GENERIC_TERMS.has(term)));
}

function uniqueContentTerms(terms: string[]): string[] {
  return [...new Set(terms.filter(Boolean))];
}

function inferContentPreferencesFromQuery(query?: string, location?: string): string[] {
  if (!query) return [];
  const explicitTypeTerms = Array.from(query.matchAll(/([가-힣A-Za-z0-9]{2,12})(?:집|전문점|가게)/g)).map(
    (match) => match[1] ?? ""
  );
  const shortRawFishTerms = /(?:^|\s)회(?:\s|$)/.test(query) ? ["회"] : [];
  const inferred = [
    ...CONCRETE_CONTENT_TERMS.filter((term) => query.includes(term)),
    ...shortRawFishTerms,
    ...explicitTypeTerms,
    ...inferFreeformContentTermsFromQuery(query, location)
  ];
  if (inferred.includes("스시") && !inferred.includes("초밥")) inferred.push("초밥");
  if (inferred.includes("초밥") && !inferred.includes("스시")) inferred.push("스시");
  if (inferred.includes("베이커리") && !inferred.includes("빵집")) inferred.push("빵집");
  if (inferred.includes("빵집") && !inferred.includes("베이커리")) inferred.push("베이커리");
  if (inferred.includes("햄버거") && !inferred.includes("버거")) inferred.push("버거");
  if (inferred.includes("횟집") && !inferred.includes("회")) inferred.push("회");
  if (inferred.includes("회") && !inferred.includes("횟집")) inferred.push("횟집");
  return inferred;
}

export function resolveRecommendSearchIntent(
  input: RecommendAccessiblePlacesInput,
  defaults: { defaultRadiusM: number; defaultLimit: number }
): {
  location: string;
  category: Category;
  radiusM: number;
  limit: number;
  preferences: string[];
  unsupportedPreferences: string[];
  contentPreferences: string[];
  searchPreferences: string[];
} {
  const location = resolveInputLocation(input.location, input.query);
  const category = inferCategoryFromQuery(input.query, normalizeCategory(input.category));
  const radiusM = input.radius_m ?? defaults.defaultRadiusM;
  const limit = input.limit ?? defaults.defaultLimit;
  const { supported: preferences, unsupported: unsupportedPreferences } = splitPreferences(input.preferences ?? []);
  const queryContentPreferences = inferContentPreferencesFromQuery(input.query, location);
  const contentPreferenceSource =
    input.query && queryContentPreferences.length > 0 ? queryContentPreferences : unsupportedPreferences;
  const contentPreferences = contentSearchPreferences(contentPreferenceSource);
  return {
    location,
    category,
    radiusM,
    limit,
    preferences,
    unsupportedPreferences,
    contentPreferences,
    searchPreferences: [...preferences, ...contentPreferences]
  };
}

function contentTermMatchesText(term: string, text: string): boolean {
  if (term === "회") {
    return /(?:^|[\s>,])회(?:$|[\s>,])|횟집|회센타|회센터|생선회/.test(text);
  }
  return text.includes(term);
}

function placeMatchesContentPreferences(place: { name: string; category: string | Category; searchAliases?: string[] }, preferences: string[]): boolean {
  if (preferences.length === 0) return true;
  const text = [
    place.name,
    String(place.category),
    ...(place.searchAliases ?? [])
  ].join(" ");
  return preferences.some((preference) => contentTermMatchesText(preference, text));
}

function fillMissingHubAddress(place: PlaceCandidate, origin: Origin, location: string): PlaceCandidate {
  if (place.address || place.roadAddress || !origin.address) return place;
  const text = `${location} ${origin.name} ${place.name}`;
  if (!/(?:공항|역|터미널|항만|항구|백화점|몰|스타필드)/.test(text)) return place;
  const distanceM = distanceMeters(origin, { lat: place.lat, lng: place.lng });
  if (distanceM > 150) return place;
  return {
    ...place,
    address: `${origin.address} (시설 내)`,
    distance_m: place.distance_m ?? Math.round(distanceM)
  };
}

async function searchContentSpecificLocalCandidates(input: {
  kakaoLocal: KakaoLocalClient;
  location: string;
  origin: Origin;
  radiusM: number;
  contentPreferences: string[];
  limit: number;
}): Promise<PlaceCandidate[]> {
  if (input.contentPreferences.length === 0) return [];
  const terms = input.contentPreferences.slice(0, 3);
  const results = await Promise.all(
    terms.map((term) =>
      input.kakaoLocal.keywordSearch(
        `${input.location} ${term}`,
        input.origin.lng,
        input.origin.lat,
        input.radiusM,
        Math.max(2, Math.min(input.limit, 5))
      )
    )
  );
  return results.flat();
}

export async function recommendAccessiblePlacesByReviewSearch(
  input: RecommendAccessiblePlacesInput,
  config: AppConfig
): Promise<Record<string, unknown>> {
  const {
    location,
    category,
    radiusM,
    limit,
    preferences,
    unsupportedPreferences,
    contentPreferences,
    searchPreferences
  } = resolveRecommendSearchIntent(input, {
    defaultRadiusM: config.defaultRadiusM,
    defaultLimit: config.defaultLimit
  });
  const interpretation = {
    location,
    category,
    radius_m: radiusM,
    preferences,
    unsupported_preferences: unsupportedPreferences,
    content_preferences: contentPreferences
  };

  const kakaoLocal = new KakaoLocalClient(config);
  const publicData = new PublicDataClient(config);
  const reviewSearch = new ReviewSearchService(config);
  const origin = await kakaoLocal.resolveLocation(location);
  const candidateLimit = Math.min(Math.max(limit * 2, 1), config.maxPlaceCandidates);
  const [discoveredCandidates, contentLocalCandidates, localCandidates] = await Promise.all([
    discoverPlaceCandidatesByBroadReviewSearch({
      config,
      kakaoLocal,
      origin,
      location,
      category,
      radiusM,
      preferences: searchPreferences,
      limit: Math.min(limit, config.maxPlaceCandidates)
    }),
    searchContentSpecificLocalCandidates({
      kakaoLocal,
      location,
      origin,
      radiusM,
      contentPreferences,
      limit: Math.min(limit, config.maxPlaceCandidates)
    }),
    kakaoLocal.searchNearbyPlaces(location, origin, category, radiusM, candidateLimit)
  ]);
  const mergedCandidates = mergePlaceCandidates(
    mergePlaceCandidates(discoveredCandidates, contentLocalCandidates),
    localCandidates
  ).map((place) =>
    fillMissingHubAddress(place, origin, location)
  );
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
    const review = await reviewSearch.analyzePlace(place, location, searchPreferences, reviewQueryLimit);
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
