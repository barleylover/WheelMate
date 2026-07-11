import { normalizeCategory } from "../core/categoryMapper.js";
import {
  clampInteger,
  MAX_RADIUS_M,
  MAX_RECOMMENDATION_LIMIT,
  MIN_RADIUS_M,
  normalizePreferenceList
} from "../core/inputLimits.js";
import type { Category } from "../types.js";
import { splitPreferences } from "../reviewSearch/queryBuilder.js";
import {
  inferLocationFromQuery,
  locationScope,
  normalizeLocationScope,
  type LocationScope
} from "./locationScope.js";

export interface RecommendIntentInput {
  query?: string;
  location?: string;
  category?: Category;
  radius_m?: number;
  limit?: number;
  preferences?: string[];
}

export type ContentTermSource = "explicit" | "query" | "none";

export interface ResolvedSearchIntent {
  rawQuery?: string;
  location: string;
  scope: LocationScope;
  category: Category;
  radiusM: number;
  limit: number;
  preferences: string[];
  unsupportedPreferences: string[];
  contentPreferences: string[];
  contentTermSource: ContentTermSource;
  hardContentFilter: boolean;
  searchPreferences: string[];
  warnings: string[];
}

const CONTENT_SYNONYMS: Record<string, string[]> = {
  햄버거: ["햄버거", "버거"], 버거: ["버거", "햄버거"],
  횟집: ["횟집", "회", "생선회"], 회: ["회", "횟집", "생선회"], 생선회: ["생선회", "횟집", "회"],
  해산물: ["해산물", "해물"], 해물: ["해물", "해산물"],
  초밥: ["초밥", "스시"], 스시: ["스시", "초밥"],
  베이커리: ["베이커리", "빵집"], 빵집: ["빵집", "베이커리"],
  돈까스: ["돈까스", "돈가스"], 돈가스: ["돈가스", "돈까스"],
  쌀국수: ["쌀국수", "베트남"],
  고깃집: ["고깃집", "고기", "구이"], 고기집: ["고기집", "고기", "구이"],
  중국집: ["중국집", "중식"], 치킨집: ["치킨집", "치킨"], 타코집: ["타코집", "타코"],
  비건: ["비건", "채식"], 채식: ["채식", "비건"]
};

const CORRECTION_SEPARATOR = /(?:말고|아니라|아니고|대신|싫고)/;

const GENERIC_OR_ACCESSIBILITY_TERMS = new Set([
  "휠체어", "전동휠체어", "휠체어가능", "휠체어이용", "휠체어접근", "장애인", "접근성", "접근",
  "출입", "입장", "이용", "가능", "이용가능", "출입가능", "접근가능", "무장애", "배리어프리",
  "베리어프리", "문턱", "단차", "경사로", "슬로프", "계단", "엘리베이터", "엘베", "승강기",
  "화장실", "장애인화장실", "충전기", "전동휠체어충전기", "유모차", "조용한", "분위기", "분위기좋은", "넓은", "맛있는", "맛집",
  "좋은", "용이한", "용이", "편한", "편하게", "근처", "주변", "인근", "부근", "추천", "추천좀",
  "추천해줘", "찾아줘", "가야해", "갈거야", "갈게", "갈께", "가려고", "가려는데", "갈건데",
  "갈텐데", "방문할거야", "갈만한", "가기좋은", "타고", "장소", "곳", "가게", "음식점", "식당", "카페"
]);

const KNOWN_CONTENT_TERMS = [
  "장애인 화장실", "전동휠체어 충전기", "생선회", "해산물", "횟집", "해물", "조개구이", "양꼬치",
  "닭강정", "한정식", "훠궈", "마라탕", "라멘", "라면", "초밥", "스시", "포케", "파스타", "피자",
  "햄버거", "버거", "샌드위치", "샐러드", "베이커리", "빵집", "디저트", "브런치", "한식", "중식",
  "일식", "양식", "분식", "삼겹살", "갈비", "국밥", "칼국수", "냉면", "김밥", "떡볶이", "쌀국수",
  "돈까스", "돈가스", "비건", "채식", "고깃집", "고기집", "중국집", "치킨집", "타코집", "타코",
  "브리또", "약국", "병원", "서점", "영화관", "공연장", "도서관", "미술관", "박물관", "전시관",
  "쇼핑몰", "백화점", "마트", "편의점", "은행", "미용실", "헬스장", "연극", "술집", "찻집", "공원",
  "베이글", "도넛", "펍", "바", "극장", "전시", "갤러리", "할랄", "글루텐프리", "콘센트", "24시간"
];

const EXACT_SUFFIX_TERMS = new Set(["횟집", "고깃집", "고기집", "중국집", "치킨집", "타코집", "빵집", "술집", "찻집"]);
const ALLOWED_SHORT_TERMS = new Set(["회", "펍", "바"]);

function focusedTarget(query?: string): string {
  if (!query) return "";
  const parts = query.split(CORRECTION_SEPARATOR);
  return (parts.at(-1) ?? query).trim();
}

export function inferCategoryFromQuery(query: string | undefined, fallback: Category): Category {
  const target = focusedTarget(query);
  if (!target) return fallback;
  const patterns: Array<{ category: Category; pattern: RegExp }> = [
    { category: "restroom", pattern: /(?:장애인\s*)?화장실/g },
    { category: "charger", pattern: /(?:전동휠체어\s*)?충전기|전동휠체어\s*충전/g },
    { category: "museum", pattern: /박물관|미술관|갤러리/g },
    { category: "culture", pattern: /영화관|공연장|도서관|전시관|연극|극장|전시(?:\s*공간)?/g },
    { category: "cafe", pattern: /카페|까페|커피숍|커피|베이커리|빵집|베이글|도넛|디저트|브런치|찻집/g },
    {
      category: "restaurant",
      pattern: /음식점|식당|맛집|밥집|레스토랑|술집|횟집|회센터|생선회|해산물|해물|(?:^|\s)회(?=\s|$)|조개구이|양꼬치|닭강정|한정식|마라탕|훠궈|라멘|라면|초밥|스시|포케|파스타|피자|햄버거|버거|샌드위치|샐러드|한식|중식|일식|양식|분식|삼겹살|갈비|국밥|칼국수|냉면|김밥|떡볶이|쌀국수|돈까스|돈가스|고깃집|고기집|중국집|치킨집|타코|브리또|비건|채식|오마카세|딤섬|점심|저녁|식사|먹을\s*곳|펍|(?:^|\s)바(?=\s|$)/g
    }
  ];
  let selected: { category: Category; index: number } | undefined;
  for (const { category, pattern } of patterns) {
    for (const match of target.matchAll(pattern)) {
      const index = match.index ?? -1;
      if (!selected || index >= selected.index) selected = { category, index };
    }
  }
  return selected?.category ?? fallback;
}

function normalizeQueryText(value?: string): string | undefined {
  if (!value) return value;
  return value
    .normalize("NFKC")
    .replace(/휠\s*(?:체어|채어|체여)/g, "휠체어")
    .replace(/배리어\s*프리/g, "배리어프리")
    .replace(/베리어\s*프리/g, "베리어프리")
    .replace(/까페/g, "카페")
    .replace(/([가-힣A-Za-z0-9]+)\s+역(?=\s|$|[?!.,])/g, "$1역")
    .replace(/\s+/g, " ")
    .trim();
}

function inferAccessibilityPreferences(
  query: string | undefined,
  category: Category,
  locations: Array<string | undefined> = []
): string[] {
  if (!query) return [];
  const target = stripLocations(query, locations);
  const preferences: string[] = [];
  if (category !== "restroom" && /(?:장애인|다목적|무장애)\s*화장실/.test(target)) {
    preferences.push("장애인화장실");
  }
  if (category !== "charger" && /(?:전동)?휠체어\s*충전기|충전기\s*(?:근처|주변|가까운|인근)/.test(target)) {
    preferences.push("충전기근처");
  }
  if (/(?:문턱|단차|경사로|슬로프|출입구|입구)/.test(target)) {
    preferences.push("입구중요");
  }
  if (/계단.{0,12}(?:없|피|회피|싫|어렵|힘들|못)/.test(target)) {
    preferences.push("계단회피");
  }
  if (/(?:엘리베이터|엘베|승강기)/.test(target)) {
    preferences.push("엘리베이터");
  }
  return [...new Set(preferences)];
}

function normalizeContentTerm(value: string): string {
  const compact = value.trim().replace(/\s+/g, "");
  if (EXACT_SUFFIX_TERMS.has(compact) || [...EXACT_SUFFIX_TERMS].some((term) => compact.endsWith(term))) {
    return compact;
  }
  return compact
    .replace(/(?:으로|로)?(?:갈만한|가기좋은|접근가능한|이용가능한)$/g, "")
    .replace(/(?:맛집|전문점|집|가게)$/g, "");
}

function removeSubsumedTerms(terms: string[]): string[] {
  const generic = new Set(["버거", "햄버거", "카페", "식당", "음식점", "술집", "찻집"]);
  return terms.filter((term) => {
    if (ALLOWED_SHORT_TERMS.has(term)) return true;
    if (terms.some((other) => other === `${term}집` || other === `${term}전문점` || other === `${term}가게`)) return false;
    if (["카페", "식당", "음식점"].some((suffix) => term.endsWith(suffix)) &&
      terms.some((other) => other !== term && other.length >= 2 && term.includes(other))) return false;
    if (!generic.has(term)) return true;
    return !terms.some((other) => other !== term && other.length > term.length && other.includes(term));
  });
}

export function contentSearchPreferences(values: string[]): string[] {
  const normalized = removeSubsumedTerms(values
    .map(normalizeContentTerm)
    .filter((term) => (term.length >= 2 || ALLOWED_SHORT_TERMS.has(term)) && !GENERIC_OR_ACCESSIBILITY_TERMS.has(term)));
  return [...new Set(normalized.flatMap((term) => CONTENT_SYNONYMS[term] ?? [term]))].slice(0, 4);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripNoise(value: string): string {
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/[?!.,]/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/(?:다리가\s*불편한|보행이\s*어려운|거동이\s*불편한)\s*(?:아버지|어머니|부모님|어르신)?(?:와|랑|하고)?/g, " ")
    .replace(/(?:아버지|어머니|부모님|어르신)\s*(?:모시고|와|랑|하고)?/g, " ")
    .replace(/모시고/g, " ")
    .replace(/(?:이동약자|교통약자|보행약자)(?:와|랑|하고)?/g, " ")
    .replace(/(?:전동)?휠체어(?:를|로|가|는|와|랑)?\s*(?:타고|이용해서|이용하여|사용해서)?/g, " ")
    .replace(/유모차(?:를|로|가|는|와|랑)?/g, " ")
    .replace(/(?:장애인|다목적|무장애)\s*화장실(?:이|가|은|는)?/g, " ")
    .replace(/(?:전동)?휠체어\s*충전기|충전기(?:가|는|이)?/g, " ")
    .replace(/(?:계단|문턱|단차|경사로|슬로프|엘리베이터|엘베|승강기|출입구|입구)(?:을|를|이|가|은|는)?\s*(?:없(?:는|고|어도)?|있(?:는|고|어도)?|피해야|피할|회피|낮은|넓은)?/g, " ")
    .replace(/(?:혹시|안녕하세요|부탁드립니다|부탁드려요|부탁해요|부탁해|알려줄래요|알려줄래|알려줘요|알려줘|해줄래요|해줄래|줄래요|줄래|해야\s*해|해야해|해야|해서|접근성|접근|출입|입장|이용|가능한|가능|용이한|용이|(?<!불)편한|편하게|괜찮은|갈만한|갈\s*수|갈\s*거야|갈거야|갈\s*게|갈게|갈께|갈\s*건데|갈건데|갈\s*텐데|갈텐데|갈\s*예정|가려고\s*해|가려고|가려는데|방문할\s*거야|방문하려고|살\s*수\s*있나|가기좋은|가기|추천해주세요|추천해줘|추천좀|추천|찾아줘|찾고\s*있(?:어|어요|습니다)?|찾고|찾는\s*중|가야해|해줘|타고|근처|주변|인근|부근|근방|대신|말고|아니라|아니고|싫고|좀|꼭|좋은|맛있는|맛집|넓은|조용한|분위기|장소|점심|저녁|식사|먹을\s*곳|곳|가게|공간|좌석|아기랑|아이랑|혼밥|있는|없는|많은|가까운|있나요|있어요|있어|어디야|데|전체|전역|전\s*지역|일대|카페|커피숍|커피|음식점|식당)/g, " ")
    .replace(/(?:^|\s)(?:밥집|레스토랑)(?=\s|$)/g, " ")
    .replace(/(?:^|\s)(?:쪽|에서|으로|로|에|의|은|는)(?=\s|$)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripLocations(query: string, locations: Array<string | undefined>): string {
  let output = query;
  for (const location of [...new Set(locations.filter((item): item is string => Boolean(item?.trim())))]) {
    const suffix = "(?:에서는|에는|으로는|로는|에서요|에서|으로|로|에|엔|의|은|는|쪽에|쪽)?";
    output = output.replace(new RegExp(`${escapeRegExp(location)}${suffix}`, "g"), " ");
    output = output.replace(new RegExp(`${escapeRegExp(location.replace(/\s+/g, ""))}${suffix}`, "g"), " ");
  }
  return output;
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function inferContentFromQuery(query: string | undefined, locations: Array<string | undefined>): string[] {
  const target = focusedTarget(query);
  if (!target) return [];
  const withoutLocation = stripLocations(target, locations);
  const specialPhrases = [
    ...Array.from(withoutLocation.matchAll(/반려(?:동물|견)\s*동반\s*(?:가능한\s*)?카페/g)).map(() => "반려동물동반카페"),
    ...Array.from(withoutLocation.matchAll(/루프탑\s*술집/g)).map(() => "루프탑술집")
  ];
  const text = stripNoise(withoutLocation);
  const known = KNOWN_CONTENT_TERMS
    .filter((term) => text.includes(term))
    .sort((a, b) => text.indexOf(a) - text.indexOf(b));
  const explicitSuffixes = Array.from(text.matchAll(/([가-힣A-Za-z0-9]{2,12})(?:집|전문점|가게)/g)).map((match) => match[0] ?? "");
  const shortFish = /(?:^|\s)회(?:\s|$)/.test(text) ? ["회"] : [];
  const tokens = text.split(/\s+/).filter(Boolean);
  const freeform = specialPhrases.length > 0
    ? []
    : tokens.filter((token) =>
      (token.length >= 2 || ALLOWED_SHORT_TERMS.has(token)) &&
      !KNOWN_CONTENT_TERMS.includes(token) &&
      !CONTENT_SYNONYMS[token]
    );
  return unique([...known, ...shortFish, ...explicitSuffixes, ...specialPhrases, ...freeform]);
}

export function resolveSearchIntent(
  input: RecommendIntentInput,
  defaults: { defaultRadiusM: number; defaultLimit: number }
): ResolvedSearchIntent {
  const normalizedQuery = normalizeQueryText(input.query);
  const explicitLocation = input.location ? normalizeLocationScope(input.location) : undefined;
  const inferredLocation = inferLocationFromQuery(normalizedQuery);
  const location = explicitLocation || inferredLocation;
  if (!location) throw new Error("location is required or must be inferable from query");

  const scope = locationScope(location);
  const category = input.category ? normalizeCategory(input.category) : inferCategoryFromQuery(normalizedQuery, "any");
  const radiusM = scope === "region"
    ? MAX_RADIUS_M
    : clampInteger(input.radius_m, defaults.defaultRadiusM, MIN_RADIUS_M, MAX_RADIUS_M);
  const limit = clampInteger(input.limit, defaults.defaultLimit, 1, MAX_RECOMMENDATION_LIMIT);
  const normalizedPreferences = normalizePreferenceList(input.preferences);
  const split = splitPreferences(normalizedPreferences);
  const inferredAccessibility = inferAccessibilityPreferences(normalizedQuery, category, [location, inferredLocation]);
  const supportedPreferences = unique([...split.supported, ...inferredAccessibility]);
  const inferredContent = inferContentFromQuery(normalizedQuery, [location, inferredLocation]);
  const contentTermSource: ContentTermSource = split.unsupported.length > 0
    ? "explicit"
    : inferredContent.length > 0
      ? "query"
      : "none";
  const contentPreferences = contentSearchPreferences(
    split.unsupported.length > 0 ? split.unsupported : inferredContent
  );
  const warnings: string[] = [];
  if (explicitLocation && inferredLocation && explicitLocation !== inferredLocation) {
    warnings.push("structured_location_overrode_query_location");
  }
  if (scope === "region") warnings.push("regional_scope_uses_broad_candidate_search");

  return {
    rawQuery: input.query,
    location,
    scope,
    category,
    radiusM,
    limit,
    preferences: supportedPreferences,
    unsupportedPreferences: split.unsupported,
    contentPreferences,
    contentTermSource,
    hardContentFilter: contentTermSource === "explicit",
    searchPreferences: [...supportedPreferences, ...contentPreferences],
    warnings
  };
}

export function resolveRecommendSearchIntent(
  input: RecommendIntentInput,
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
  const intent = resolveSearchIntent(input, defaults);
  return {
    location: intent.location,
    category: intent.category,
    radiusM: intent.radiusM,
    limit: intent.limit,
    preferences: intent.preferences,
    unsupportedPreferences: intent.unsupportedPreferences,
    contentPreferences: intent.contentPreferences,
    searchPreferences: intent.searchPreferences
  };
}

export { inferLocationFromQuery } from "./locationScope.js";
