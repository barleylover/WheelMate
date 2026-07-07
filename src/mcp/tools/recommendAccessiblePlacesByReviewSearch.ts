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
  "맛집",
  "좋은",
  "용이한",
  "용이",
  "편한",
  "편하게",
  "근처",
  "주변",
  "인근",
  "부근",
  "추천",
  "추천좀",
  "추천해줘",
  "찾아줘",
  "가야해",
  "갈거야",
  "갈게",
  "갈께",
  "가려고",
  "가려는데",
  "갈건데",
  "갈텐데",
  "방문할거야",
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
  "조개구이",
  "양꼬치",
  "닭강정",
  "한정식",
  "훠궈",
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
  "빵집",
  "술집",
  "찻집"
]);

const ALLOWED_SHORT_CONTENT_TERMS = new Set(["회"]);

const REGION_LOCATION_TOKENS = new Set([
  "서울",
  "부산",
  "대구",
  "인천",
  "광주",
  "대전",
  "울산",
  "세종",
  "제주",
  "경기",
  "강원",
  "충북",
  "충남",
  "전북",
  "전남",
  "경북",
  "경남"
]);

const KNOWN_AREA_LOCATION_TOKENS = new Set([
  "강남",
  "홍대",
  "신촌",
  "사당",
  "성수",
  "잠실",
  "청담",
  "압구정",
  "명동",
  "종로",
  "이태원",
  "여의도",
  "서면",
  "해운대",
  "주안",
  "부평",
  "동성로",
  "수원",
  "전주",
  "대학로",
  "건대",
  "왕십리",
  "연남",
  "합정",
  "망원",
  "상수",
  "을지로",
  "인사동",
  "판교",
  "용산",
  "서울숲",
  "충장로",
  "제주시",
  "서귀포"
]);

function hasLocationSuffix(value: string): boolean {
  return /(?:역|동|구|시|군|도|읍|면|리|공항|터미널|시장|마을|광장|캠퍼스|대학교|해수욕장|공원|궁|몰|백화점)$/.test(value);
}

function normalizeContentTerm(preference: string): string {
  const compact = preference
    .trim()
    .replace(/\s+/g, "");
  if (EXACT_CONTENT_TERMS.has(compact)) return compact;
  if ([...EXACT_CONTENT_TERMS].some((term) => compact.endsWith(term))) return compact;
  return compact
    .replace(/(?:으로|로)?(?:갈만한|가기좋은|접근가능한|이용가능한)$/g, "")
    .replace(/(?:맛집|전문점|집|가게)$/g, "");
}

function expandContentTerm(term: string): string[] {
  return CONTENT_SYNONYMS[term] ?? [term];
}

function removeSubsumedContentTerms(terms: string[]): string[] {
  const subsumableGenericTerms = new Set(["버거", "햄버거", "카페", "식당", "음식점", "술집", "찻집"]);
  const genericCategorySuffixes = ["카페", "식당", "음식점"];
  return terms.filter((term) => {
    if (ALLOWED_SHORT_CONTENT_TERMS.has(term)) return true;
    if (
      genericCategorySuffixes.some((suffix) => term.endsWith(suffix)) &&
      terms.some((other) => other !== term && other.length >= 2 && term.includes(other))
    ) {
      return false;
    }
    if (terms.some((other) => other === `${term}집` || other === `${term}전문점` || other === `${term}가게`)) {
      return false;
    }
    if (!subsumableGenericTerms.has(term)) return true;
    return !terms.some((other) => other !== term && other.length > term.length && other.includes(term));
  });
}

export function contentSearchPreferences(preferences: string[]): string[] {
  const terms = removeSubsumedContentTerms(preferences
    .map(normalizeContentTerm)
    .filter((preference) =>
      (preference.length >= 2 || ALLOWED_SHORT_CONTENT_TERMS.has(preference)) &&
      !ACCESSIBILITY_OR_GENERIC_TERMS.has(preference)
    ));
  return [...new Set(terms.flatMap(expandContentTerm))].slice(0, 4);
}

function compactText(value: string): string {
  return value.replace(/\s+/g, "");
}

function stripQueryNoise(value: string): string {
  return value
    .replace(/[?!.,]/g, " ")
    .replace(/휠체어(?:를|로)?\s*(?:타고|이용해서|이용하여)?/g, " ")
    .replace(/전동휠체어/g, " ")
    .replace(/(?:해야\s*해|해야해|해야|장애인|접근성|접근|출입|입장|이용|가능한|가능|용이한|용이|편한|편하게|괜찮은|갈만한|갈\s*수|갈\s*거야|갈거야|갈\s*게|갈게|갈께|갈\s*건데|갈건데|갈\s*텐데|갈텐데|갈\s*예정|가려고|가려는데|방문할\s*거야|방문하려고|살\s*수\s*있나|가기좋은|가기|추천해줘|추천좀|추천|찾아줘|가야해|해줘|타고|근처|주변|인근|부근|말고|좀|좋은|맛있는|맛집|넓은|조용한|분위기|장소|곳|가게|좌석|아기랑|유모차랑|유모차|혼밥|있는|데)/g, " ")
    .replace(/(?:^|\s)(?:쪽|에서|으로|로|에|의)(?=\s|$)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanLocationCandidate(value: string): string | undefined {
  const cleaned = value
    .replace(/[?!.,]/g, " ")
    .replace(/(?:근처|주변|인근|부근|쪽|에서|으로|로|에|의)\s*$/g, " ")
    .replace(/휠체어(?:를|로)?\s*(?:타고|이용해서|이용하여)?/g, " ")
    .replace(/갈\s*수\s*있는/g, " ")
    .replace(/갈\s*수/g, " ")
    .replace(/(?:근처|주변|인근|부근|쪽)/g, " ")
    .replace(/(?:휠체어|전동휠체어|장애인|접근성|접근|출입|입장|이용|가능한|가능|용이한|용이|편한|편하게|갈만한|갈\s*거야|갈거야|갈\s*게|갈게|갈께|갈\s*건데|갈건데|갈\s*텐데|갈텐데|갈\s*예정|가려고|가려는데|방문할\s*거야|방문하려고|가기좋은|가기|가는|가도|가고|가려는|조용한|분위기|넓은|맛있는|좋은|추천|찾아줘|추천좀|추천해줘|타고|있는|가야해|해야\s*해|해야해|해야|해줘|장소|곳|가게|데)/g, " ")
    .replace(/\b한\b/g, " ")
    .replace(/(?:근처|주변|인근|부근|쪽|에서|으로|로|에|의)\s*$/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned || cleaned.length < 2) return undefined;
  return cleaned;
}

function locationCandidateLooksPlausible(location: string): boolean {
  const compact = compactText(location);
  if (hasLocationSuffix(compact)) {
    return true;
  }
  const tokens = location.split(/\s+/).filter(Boolean);
  if (tokens.some((token) => REGION_LOCATION_TOKENS.has(token) || KNOWN_AREA_LOCATION_TOKENS.has(token))) {
    return true;
  }
  return false;
}

function normalizeLocationToken(token: string): string {
  const stripped = token.replace(/(?:에서|으로|에|의)$/, "");
  if (stripped !== token && (REGION_LOCATION_TOKENS.has(stripped) || KNOWN_AREA_LOCATION_TOKENS.has(stripped) || hasLocationSuffix(stripped))) {
    return stripped;
  }
  return token;
}

function inferPrefixLocationFromText(value: string): string | undefined {
  const stripped = stripQueryNoise(value);
  const tokens = stripped.split(/\s+/).filter(Boolean).map(normalizeLocationToken);
  if (tokens.length === 0) return undefined;
  const first = tokens[0] ?? "";
  const second = tokens[1] ?? "";
  if (REGION_LOCATION_TOKENS.has(first)) {
    const suffixIndex = tokens.slice(1, 4).findIndex((token) => hasLocationSuffix(token));
    if (suffixIndex >= 0) {
      return tokens.slice(0, suffixIndex + 2).join(" ");
    }
    if (second && (KNOWN_AREA_LOCATION_TOKENS.has(second) || hasLocationSuffix(second))) {
      return `${first} ${second}`;
    }
    return first;
  }
  if (KNOWN_AREA_LOCATION_TOKENS.has(first) || hasLocationSuffix(first)) {
    const suffixIndex = tokens.slice(1, 4).findIndex((token) => hasLocationSuffix(token));
    if (suffixIndex >= 0) {
      return tokens.slice(0, suffixIndex + 2).join(" ");
    }
    if (second && hasLocationSuffix(second)) return `${first} ${second}`;
    return first;
  }
  return undefined;
}

function inferLocationBeforeTrailingTarget(query: string): string | undefined {
  const stripped = stripQueryNoise(query);
  const tokens = stripped.split(/\s+/).filter(Boolean);
  if (tokens.length < 2) return undefined;
  const candidate = cleanLocationCandidate(tokens.slice(0, -1).join(" "));
  if (!candidate || !locationCandidateLooksPlausible(candidate)) return undefined;
  return candidate;
}

export function inferLocationFromQuery(query?: string): string | undefined {
  if (!query) return undefined;
  const normalized = query.replace(/\s+/g, " ").trim();
  const suffixMatch = normalized.match(
    /([가-힣A-Za-z0-9]+(?:\s+[가-힣A-Za-z0-9]+){0,4}?(?:역|동|구|시|군|도|읍|면|리|공항|터미널|시장|마을|광장|캠퍼스|대학교|해수욕장|공원|궁|몰|백화점))(?=\s|$)/
  );
  const suffixLocation = cleanLocationCandidate(suffixMatch?.[1] ?? "");
  if (suffixLocation && locationCandidateLooksPlausible(suffixLocation)) return suffixLocation;

  const keywordPositions = CONTENT_OR_CATEGORY_TERMS
    .map((term) => normalized.indexOf(term))
    .filter((index) => index > 0);
  if (keywordPositions.length > 0) {
    const beforeTarget = normalized.slice(0, Math.min(...keywordPositions));
    const prefix = inferPrefixLocationFromText(beforeTarget);
    if (prefix) return prefix;
    const cleaned = cleanLocationCandidate(beforeTarget);
    if (cleaned && locationCandidateLooksPlausible(cleaned)) return cleaned;
  }

  const prefixLocation = inferPrefixLocationFromText(normalized);
  if (prefixLocation) return prefixLocation;
  return inferLocationBeforeTrailingTarget(normalized);
}

function resolveInputLocation(inputLocation: string | undefined, query?: string): string {
  const explicit = inputLocation?.trim();
  if (explicit) return explicit;
  const inferred = inferLocationFromQuery(query);
  if (inferred) return inferred;
  throw new Error("location is required or must be inferable from query");
}

function originIsResolved(origin: Origin): boolean {
  return origin.provider !== "unresolved" &&
    Number.isFinite(origin.lat) &&
    Number.isFinite(origin.lng) &&
    !(origin.lat === 0 && origin.lng === 0);
}

function regionalLocationToken(location: string): string | null {
  const compact = location.replace(/\s+/g, "");
  const known = new Map([
    ["제주도", "제주"],
    ["제주", "제주"],
    ["제주특별자치도", "제주"],
    ["서울", "서울"],
    ["서울시", "서울"],
    ["부산", "부산"],
    ["대구", "대구"],
    ["인천", "인천"],
    ["광주", "광주"],
    ["대전", "대전"],
    ["울산", "울산"],
    ["울릉도", "울릉"],
    ["울릉군", "울릉"],
    ["울릉", "울릉"],
    ["세종", "세종"],
    ["경기도", "경기"],
    ["강원도", "강원"],
    ["강원특별자치도", "강원"],
    ["충청북도", "충북"],
    ["충북", "충북"],
    ["충청남도", "충남"],
    ["충남", "충남"],
    ["전라북도", "전북"],
    ["전북", "전북"],
    ["전북특별자치도", "전북"],
    ["전라남도", "전남"],
    ["전남", "전남"],
    ["경상북도", "경북"],
    ["경북", "경북"],
    ["경상남도", "경남"],
    ["경남", "경남"]
  ]);
  return known.get(compact) ?? null;
}

function placeMatchesRegionalLocation(place: PlaceCandidate, location: string): boolean {
  const token = regionalLocationToken(location);
  if (!token) return false;
  return `${place.address ?? ""} ${place.roadAddress ?? ""}`.includes(token);
}

function attachOriginDistance(place: PlaceCandidate, origin: Origin, location: string): PlaceCandidate {
  if (!originIsResolved(origin) || placeMatchesRegionalLocation(place, location)) return place;
  const distance = distanceMeters(origin, { lat: place.lat, lng: place.lng });
  if (!Number.isFinite(distance)) return place;
  return {
    ...place,
    distance_m: Math.round(distance)
  };
}

function placeWithinRequestedArea(place: PlaceCandidate, origin: Origin, location: string, radiusM: number): boolean {
  if (placeMatchesRegionalLocation(place, location)) return true;
  if (!originIsResolved(origin)) return false;
  const distance = distanceMeters(origin, { lat: place.lat, lng: place.lng });
  if (!Number.isFinite(distance)) return false;
  const maxDistanceM = Math.max(radiusM * 3, radiusM + 1_500, 2_500);
  return distance <= maxDistanceM;
}

function focusedQueryTargetClause(query: string | undefined): string | undefined {
  if (!query) return undefined;
  const parts = query.split(/말고/);
  return (parts.length > 1 ? parts[parts.length - 1] : query)?.trim();
}

export function inferCategoryFromQuery(query: string | undefined, fallback: Category): Category {
  const targetQuery = focusedQueryTargetClause(query);
  if (!targetQuery) return fallback;
  if (/장애인\s*화장실|화장실/.test(targetQuery)) return "restroom";
  if (/전동휠체어\s*충전|충전기/.test(targetQuery)) return "charger";
  if (/박물관|미술관/.test(targetQuery)) return "museum";
  if (/영화관|공연장|도서관|전시관|연극/.test(targetQuery)) return "culture";
  if (/카페|커피|베이커리|빵집|디저트|브런치|찻집/.test(targetQuery)) return "cafe";
  if (
    /음식점|식당|맛집|술집|횟집|회센터|생선회|해산물|해물|(?:^|\s)회(?:\s|$)|조개구이|양꼬치|닭강정|한정식|마라탕|훠궈|라멘|라면|초밥|스시|포케|파스타|피자|햄버거|버거|샌드위치|샐러드|한식|중식|일식|양식|분식|삼겹살|갈비|국밥|칼국수|냉면|김밥|떡볶이|쌀국수|돈까스|돈가스|고깃집|고기집|중국집|치킨집|타코|브리또|비건|채식/.test(targetQuery)
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
  "술집",
  "찻집",
  "연극",
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
  return stripQueryNoise(stripped);
}

function inferFreeformContentTermsFromQuery(query: string, location?: string): string[] {
  const stripped = stripQueryToPotentialTargets(query, location);
  if (!stripped) return [];
  const tokenTerms = stripped.split(/\s+/).filter(Boolean);
  const allTokensAreKnown = tokenTerms.every((term) => CONCRETE_CONTENT_TERMS.includes(term) || Boolean(CONTENT_SYNONYMS[term]));
  if (allTokensAreKnown) {
    return uniqueContentTerms(tokenTerms.filter((term) => !ACCESSIBILITY_OR_GENERIC_TERMS.has(term)));
  }
  const phrase = tokenTerms.join(" ");
  return uniqueContentTerms([(phrase || tokenTerms[0]) ?? ""].filter((term) => !ACCESSIBILITY_OR_GENERIC_TERMS.has(term)));
}

function uniqueContentTerms(terms: string[]): string[] {
  return [...new Set(terms.filter(Boolean))];
}

function inferContentPreferencesFromQuery(query?: string, location?: string): string[] {
  const targetQuery = focusedQueryTargetClause(query);
  if (!targetQuery) return [];
  const targetContentText = stripQueryToPotentialTargets(targetQuery, location);
  const explicitTypeTerms = Array.from(targetContentText.matchAll(/([가-힣A-Za-z0-9]{2,12})(?:집|전문점|가게)/g)).map(
    (match) => match[1] ?? ""
  );
  const shortRawFishTerms = /(?:^|\s)회(?:\s|$)/.test(targetContentText) ? ["회"] : [];
  const inferred = [
    ...CONCRETE_CONTENT_TERMS
      .filter((term) => targetContentText.includes(term))
      .sort((a, b) => targetContentText.indexOf(a) - targetContentText.indexOf(b)),
    ...shortRawFishTerms,
    ...explicitTypeTerms,
    ...inferFreeformContentTermsFromQuery(targetContentText)
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
  const category = input.category ? normalizeCategory(input.category) : inferCategoryFromQuery(input.query, "any");
  const radiusM = input.radius_m ?? defaults.defaultRadiusM;
  const limit = input.limit ?? defaults.defaultLimit;
  const { supported: preferences, unsupported: unsupportedPreferences } = splitPreferences(input.preferences ?? []);
  const queryContentPreferences = inferContentPreferencesFromQuery(input.query, location);
  const contentPreferenceSource =
    unsupportedPreferences.length > 0 ? unsupportedPreferences : queryContentPreferences;
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
  const searchVariantsForTerm = (term: string): string[] => {
    const variants = [
      term,
      term.replace(/(카페|식당|음식점|술집|찻집)$/, " $1"),
      term.replace(/동반(카페|식당|음식점|술집|찻집)$/, "동반 $1"),
      term.replace(/반려동물동반/, "애견동반").replace(/(카페|식당|음식점|술집|찻집)$/, " $1")
    ].map((value) => value.trim()).filter(Boolean);
    return [...new Set(variants)].slice(0, 3);
  };
  const results = await Promise.all(
    terms.flatMap((term) => searchVariantsForTerm(term).map((searchTerm) => ({ term, searchTerm }))).map(async ({ term, searchTerm }) => {
      const places = await input.kakaoLocal.keywordSearch(
        `${input.location} ${searchTerm}`,
        input.origin.lng,
        input.origin.lat,
        input.radiusM,
        Math.max(1, Math.min(input.limit, 2))
      );
      return places.map((place) => ({
        ...place,
        searchAliases: [...new Set([term, ...(place.searchAliases ?? [])])]
      }));
    })
  );
  return results.flat();
}

export async function recommendAccessiblePlacesByReviewSearch(
  input: RecommendAccessiblePlacesInput,
  config: AppConfig
): Promise<Record<string, unknown>> {
  let {
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
  const kakaoLocal = new KakaoLocalClient(config);
  const publicData = new PublicDataClient(config);
  const reviewSearch = new ReviewSearchService(config);
  let origin = await kakaoLocal.resolveLocation(location);
  const fallbackLocation = input.location?.trim() && !originIsResolved(origin)
    ? inferLocationFromQuery(input.query)
    : undefined;
  if (!originIsResolved(origin) && fallbackLocation && fallbackLocation !== location) {
    const fallbackOrigin = await kakaoLocal.resolveLocation(fallbackLocation);
    if (originIsResolved(fallbackOrigin)) {
      location = fallbackLocation;
      origin = fallbackOrigin;
      const explicitQueryContentPreferences = inferContentPreferencesFromQuery(input.query, location);
      const explicitContentPreferenceSource =
        unsupportedPreferences.length > 0 ? unsupportedPreferences : explicitQueryContentPreferences;
      contentPreferences = contentSearchPreferences(explicitContentPreferenceSource);
      searchPreferences = [...preferences, ...contentPreferences];
    }
  }
  const interpretation = {
    location,
    category,
    radius_m: radiusM,
    preferences,
    unsupported_preferences: unsupportedPreferences,
    content_preferences: contentPreferences
  };
  const candidateLimit = Math.min(Math.max(limit * 2, 1), config.maxPlaceCandidates);
  const [discoveredCandidates, contentLocalCandidates, localCandidates] = originIsResolved(origin)
    ? await Promise.all([
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
    ])
    : [[], [], []] as PlaceCandidate[][];
  const mergedCandidates = mergePlaceCandidates(
    mergePlaceCandidates(discoveredCandidates, contentLocalCandidates),
    localCandidates
  ).map((place) =>
    fillMissingHubAddress(place, origin, location)
  ).filter((place) =>
    placeWithinRequestedArea(place, origin, location, radiusM)
  ).map((place) =>
    attachOriginDistance(place, origin, location)
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
      4,
      place.roadAddress ?? place.address
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
  const candidateFallbackReason =
    !config.kakaoRestApiKey
      ? "kakao_local_credentials_missing"
      : !originIsResolved(origin)
        ? "location_unresolved"
        : mergedCandidates.length === 0
          ? "kakao_local_unavailable_or_no_candidates"
          : preferenceMatchedCandidates.length === 0
            ? "content_preference_filtered_all_candidates"
            : "no_review_positive_candidates";
  const fallbackReason =
    candidates.length === 0
      ? candidateFallbackReason
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
