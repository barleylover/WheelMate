import type { AppConfig } from "../config.js";
import { DaumSearchClient } from "../clients/daumSearchClient.js";
import { KakaoLocalClient } from "../clients/kakaoLocalClient.js";
import { NaverSearchClient } from "../clients/naverSearchClient.js";
import { categoryKeyword } from "../core/categoryMapper.js";
import type { Category, NormalizedSearchResult, Origin, PlaceCandidate, ReviewEvidence, SearchSource, SourceSearchOutcome } from "../types.js";
import { enabledSearchSources } from "./sourceRouter.js";
import { extractSignals } from "./signalExtractor.js";

const DISCOVERY_ACCESSIBILITY_PATTERN =
  /휠체어|전동휠체어|문턱|단차|턱\s*없|경사로|슬로프|무장애|배리어프리|베리어프리|장애인\s*화장실|엘리베이터|엘베|승강기|유모차/;
const DISCOVERY_RESULTS_PER_QUERY = 10;

const GENERIC_WORDS = [
  "휠체어",
  "전동휠체어",
  "장애인",
  "접근성",
  "이용",
  "출입",
  "입장",
  "가능",
  "가능한",
  "가능한곳",
  "가능한 곳",
  "문턱",
  "단차",
  "경사로",
  "슬로프",
  "엘리베이터",
  "엘베",
  "승강기",
  "무장애",
  "배리어프리",
  "베리어프리",
  "유모차",
  "장애인화장실",
  "장애인 화장실",
  "후기",
  "리뷰",
  "추천",
  "방문",
  "내돈내산",
  "근처",
  "주변",
  "서울",
  "서울맛집",
  "서울가볼만한곳",
  "홍대",
  "홍대입구",
  "서초",
  "방배동",
  "연남동",
  "동교동",
  "서교동",
  "이수역",
  "합정역",
  "마포홍대점",
  "맛집",
  "카페",
  "음식점",
  "식당",
  "만화방",
  "빵집",
  "베이커리",
  "디저트",
  "케이크",
  "브런치",
  "소개팅",
  "소개",
  "애견동반",
  "반려견동반",
  "가성비",
  "넓고",
  "편하며",
  "시그니처",
  "쑥",
  "라떼",
  "디카페인",
  "감성",
  "분위기있는",
  "실내데이트",
  "이색데이트",
  "놀거리",
  "가득한",
  "인생빵집",
  "찐",
  "명인",
  "점",
  "귀멸의칼날",
  "무화과",
  "카라반",
  "상세",
  "관광정보",
  "분위기",
  "좋은",
  "있는",
  "유명한",
  "만나다",
  "부근",
  "근처"
];

const LOOKUP_GENERIC_WORDS = new Set([
  "방배동빵집",
  "인생빵집",
  "베이커리",
  "디저트",
  "케이크",
  "브런치",
  "소개팅",
  "만화방",
  "실내데이트",
  "놀거리",
  "가득한",
  "메뉴",
  "찐",
  "명인",
  "점",
  "소개",
  "정보",
  "서초",
  "서울맛집",
  "서울가볼만한곳",
  "홍대",
  "홍대입구",
  "방배동",
  "연남동",
  "동교동",
  "서교동",
  "이수역",
  "합정역",
  "마포홍대점",
  "애견동반",
  "반려견동반",
  "가성비",
  "넓고",
  "편하며",
  "시그니처",
  "쑥",
  "라떼",
  "디카페인",
  "감성",
  "분위기있는",
  "이색데이트",
  "귀멸의칼날",
  "무화과",
  "카라반",
  "상세",
  "관광정보",
  "분위기",
  "좋은",
  "있는",
  "유명한",
  "만나다"
]);

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cleanSearchText(value: string): string {
  return value
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\s[-–—]\s/g, " ")
    .replace(/\.{2,}/g, " ")
    .replace(/[|｜:;!?]+/g, " ")
    .replace(/[<>{}\[\]《》“”"']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripGenericWords(value: string, location: string, category: Category): string {
  let output = cleanSearchText(value);
  const words = unique([
    location,
    location.replace(/역$/, ""),
    categoryKeyword(category),
    ...GENERIC_WORDS
  ].filter(Boolean));
  for (const word of words.sort((a, b) => b.length - a.length)) {
    output = output.replace(new RegExp(escapeRegExp(word), "g"), " ");
  }
  return output
    .replace(/\b(?:near|with|and|for)\b/gi, " ")
    .replace(/[^\p{L}\p{N}&().·\-\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function candidateLooksUsable(value: string): boolean {
  const compact = value.replace(/\s+/g, "");
  if (compact.length < 2 || compact.length > 24) return false;
  if (/^\d+$/.test(compact)) return false;
  if (/[.]{2,}|^\(|\)$|^\d{4}[.년]/.test(value)) return false;
  if (/^(부근|근처|에서|이에요|그리고|있는|좋은|가능한|애견동반|반려견동반)$/.test(compact)) return false;
  if (/(부근|근처|이에요|했습니다|있습니다|가능했습니다)$/.test(compact)) return false;
  if (DISCOVERY_ACCESSIBILITY_PATTERN.test(compact)) return false;
  return true;
}

export function buildBroadDiscoveryQueries(
  location: string,
  category: Category,
  preferences: string[] = [],
  maxQueries = 8
): string[] {
  const categoryLabel = categoryKeyword(category) || "장소";
  const categoryAliases =
    category === "restaurant"
      ? ["음식점", "식당", "맛집"]
      : category === "cafe"
        ? ["카페"]
        : [categoryLabel];
  const preferenceTerms = preferences.includes("장애인화장실") ? ["장애인 화장실"] : [];
  const contentPreferences = preferences.filter((preference) => !["장애인화장실", "충전기근처", "입구중요", "계단회피", "엘리베이터"].includes(preference));
  return unique([
    `${location} ${categoryLabel} 휠체어`,
    `${location} 휠체어 ${categoryLabel}`,
    ...categoryAliases.flatMap((alias) => [
      `${location} ${alias} 휠체어`,
      `${location} 휠체어 ${alias}`
    ]),
    ...contentPreferences.flatMap((term) => [
      `${location} ${term} 휠체어`,
      `${location} 휠체어 ${term}`,
      `${location} ${term} ${categoryLabel}`
    ]),
    `${location} ${categoryLabel} 휠체어 접근성`,
    `${location} ${categoryLabel} 문턱 경사로`,
    `${location} ${categoryLabel} 배리어프리`,
    ...preferenceTerms.map((term) => `${location} ${categoryLabel} ${term}`)
  ]).slice(0, maxQueries);
}

export function extractBroadCandidateTerms(
  result: Pick<NormalizedSearchResult, "title" | "snippet">,
  location: string,
  category: Category,
  maxTerms = 3
): string[] {
  const rawTitle = result.title;
  const title = cleanSearchText(result.title);
  const snippet = cleanSearchText(result.snippet);
  const splitParts = title.split(/\s*[-–—/,·•]\s*/).filter(Boolean);
  const specificCandidates = [
    ...Array.from(rawTitle.matchAll(/\[([^\]]{2,40})\]/g)).flatMap((match) => (match[1] ?? "").split(/[\/|｜]/)),
    ...Array.from(rawTitle.matchAll(/['"‘’“”]([^'"‘’“”]{2,24})['"‘’“”]/g)).map((match) => match[1] ?? ""),
    ...Array.from(`${title} ${snippet}`.matchAll(/(?:카페|식당|음식점|맛집)\s*([가-힣A-Za-z0-9&().·\-\s]{2,18})/g)).map((match) => match[1] ?? ""),
    ...Array.from(`${title} ${snippet}`.matchAll(/([가-힣A-Za-z0-9&().·\-\s]{2,18})\s*(?:카페|식당|음식점)/g)).map((match) => match[1] ?? ""),
    ...Array.from(title.matchAll(/(?:방문한|가능한|맛집)\s*([가-힣A-Za-z0-9&().·\-\s]{2,18})/g)).map((match) => match[1] ?? "")
  ];
  const phraseCandidates = [
    ...specificCandidates,
    title,
    ...splitParts
  ];
  return unique(
    phraseCandidates
      .map((candidate) => stripGenericWords(candidate, location, category))
      .map((candidate) => candidate.replace(/^(에서|으로|로|갈 수 있는|가기 좋은|있는|좋은|한)\s+/, "").trim())
      .map((candidate) => candidate.replace(/\s+(방문|후기|리뷰|추천|정보|방)$/, "").trim())
      .filter(candidateLooksUsable)
  ).slice(0, maxTerms);
}

export function buildKakaoLookupTerms(candidateTerm: string, maxTerms = 6): string[] {
  const cleaned = cleanSearchText(candidateTerm);
  const tokens = cleaned.split(/\s+/).filter((token) => token && !LOOKUP_GENERIC_WORDS.has(token));
  const terms: string[] = [cleaned];
  if (tokens.length > 0) {
    terms.push(tokens.join(" "));
    terms.push(tokens[0]);
  }
  for (const windowSize of [3, 2]) {
    for (let index = 0; index <= tokens.length - windowSize; index += 1) {
      terms.push(tokens.slice(index, index + windowSize).join(" "));
    }
  }
  return unique(terms.filter(candidateLooksUsable)).slice(0, maxTerms);
}

function hasDiscoverySignal(result: NormalizedSearchResult): boolean {
  return Boolean(discoveryEvidenceFromResult(result));
}

function discoveryEvidenceFromResult(result: NormalizedSearchResult): ReviewEvidence | null {
  const signals = extractSignals(result).filter((signal) => signal.type !== "basement_or_floor");
  if (!signals.some((signal) => signal.polarity === "positive")) return null;
  return {
    ...result,
    place_match_score: 0.85,
    signals
  };
}

function categoryMatches(place: PlaceCandidate, category: Category): boolean {
  const text = `${place.category} ${place.name}`;
  if (category === "any") return true;
  if (category === "cafe") return /카페|커피|디저트|베이커리/.test(text);
  if (category === "restaurant") {
    if (/카페|커피|디저트|베이커리|제과|아이스크림|빙수/.test(text)) return false;
    return /음식점|식당|한식|중식|일식|양식|분식|고기|레스토랑|맛집/.test(text);
  }
  if (category === "museum") return /박물관|미술관|전시/.test(text);
  if (category === "culture") return /문화|공연|전시|박물관|미술관|도서관/.test(text);
  return true;
}

function placeKey(place: PlaceCandidate): string {
  return place.sourcePlaceId || `${place.name}:${place.roadAddress ?? place.address ?? ""}`.replace(/\s+/g, "");
}

function broadLocationToken(location: string): string | null {
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
    ["세종", "세종"],
    ["경기도", "경기"],
    ["강원도", "강원"],
    ["충청북도", "충북"],
    ["충북", "충북"],
    ["충청남도", "충남"],
    ["충남", "충남"],
    ["전라북도", "전북"],
    ["전북", "전북"],
    ["전라남도", "전남"],
    ["전남", "전남"],
    ["경상북도", "경북"],
    ["경북", "경북"],
    ["경상남도", "경남"],
    ["경남", "경남"]
  ]);
  return known.get(compact) ?? null;
}

function placeMatchesBroadLocation(place: PlaceCandidate, locationToken: string): boolean {
  const text = `${place.name} ${place.address ?? ""} ${place.roadAddress ?? ""}`;
  return text.includes(locationToken);
}

export function mergePlaceCandidates(primary: PlaceCandidate[], secondary: PlaceCandidate[]): PlaceCandidate[] {
  const seen = new Set<string>();
  const merged: PlaceCandidate[] = [];
  for (const place of [...primary, ...secondary]) {
    const key = placeKey(place);
    if (seen.has(key)) {
      const existing = merged.find((item) => placeKey(item) === key);
      if (existing) {
        existing.searchAliases = unique([...(existing.searchAliases ?? []), ...(place.searchAliases ?? [])]);
        existing.discoveryEvidence = uniqueEvidence([...(existing.discoveryEvidence ?? []), ...(place.discoveryEvidence ?? [])]);
      }
      continue;
    }
    seen.add(key);
    merged.push(place);
  }
  return merged;
}

function uniqueEvidence(evidence: ReviewEvidence[]): ReviewEvidence[] {
  const seen = new Set<string>();
  return evidence.filter((item) => {
    const key = `${item.source}:${item.link}:${item.snippet}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function evidenceKey(evidence: ReviewEvidence): string {
  return `${evidence.source}:${evidence.link}:${evidence.title}`;
}

function compactText(value: string): string {
  return value.replace(/\s+/g, "").toLowerCase();
}

function evidencePlaceRelevance(place: PlaceCandidate, evidence: ReviewEvidence, term: string): number {
  const evidenceText = compactText(`${evidence.title} ${evidence.snippet}`);
  const placeName = compactText(place.name);
  const lookupTerm = compactText(term);
  let score = 0;
  if (placeName && evidenceText.includes(placeName)) score += 10 + Math.min(placeName.length, 12) / 10;
  if (lookupTerm.length >= 3 && evidenceText.includes(lookupTerm) && placeName.includes(lookupTerm)) score += 9;
  if (lookupTerm && evidenceText.includes(lookupTerm)) score += 4;
  if (place.roadAddress || place.address) score += 1;
  return score;
}

function uniqueLookupPairs(pairs: Array<{ term: string; evidence: ReviewEvidence }>): Array<{ term: string; evidence: ReviewEvidence }> {
  const seen = new Set<string>();
  return pairs.filter((pair) => {
    const key = compactText(pair.term);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function searchSource(
  source: SearchSource,
  query: string,
  naver: NaverSearchClient,
  daum: DaumSearchClient
): Promise<SourceSearchOutcome> {
  if (source === "naver_blog") return naver.searchBlog(query, DISCOVERY_RESULTS_PER_QUERY);
  if (source === "naver_cafe") return naver.searchCafeArticle(query, DISCOVERY_RESULTS_PER_QUERY);
  if (source === "naver_web") return naver.searchWeb(query, DISCOVERY_RESULTS_PER_QUERY);
  if (source === "daum_blog") return daum.searchBlog(query, DISCOVERY_RESULTS_PER_QUERY);
  if (source === "daum_cafe") return daum.searchCafe(query, DISCOVERY_RESULTS_PER_QUERY);
  return daum.searchWeb(query, DISCOVERY_RESULTS_PER_QUERY);
}

export async function discoverPlaceCandidatesByBroadReviewSearch(input: {
  config: AppConfig;
  kakaoLocal: KakaoLocalClient;
  origin: Origin;
  location: string;
  category: Category;
  radiusM: number;
  preferences: string[];
  limit: number;
}): Promise<PlaceCandidate[]> {
  const queries = buildBroadDiscoveryQueries(input.location, input.category, input.preferences);
  const sources = enabledSearchSources(input.config);
  const naver = new NaverSearchClient(input.config);
  const daum = new DaumSearchClient(input.config);
  const outcomes = await Promise.all(
    queries.flatMap((query) => sources.map((source) => searchSource(source, query, naver, daum)))
  );
  const termEvidencePairs = outcomes
    .flatMap((outcome) => outcome.results)
    .filter(hasDiscoverySignal)
    .flatMap((result) => {
      const evidence = discoveryEvidenceFromResult(result);
      if (!evidence) return [];
      return extractBroadCandidateTerms(result, input.location, input.category).map((term) => ({ term, evidence }));
    })
    .slice(0, 140);
  const lookupPairs = uniqueLookupPairs(
    termEvidencePairs.flatMap(({ term, evidence }) =>
      buildKakaoLookupTerms(term).map((lookupTerm) => ({ term: lookupTerm, evidence }))
    )
  ).slice(0, 220);

  const discovered: PlaceCandidate[] = [];
  const locationToken = broadLocationToken(input.location);
  const usedEvidence = new Set<string>();
  for (const { term, evidence } of lookupPairs) {
    if (discovered.length >= input.limit) break;
    const key = evidenceKey(evidence);
    if (usedEvidence.has(key)) continue;
    const lookupQueries = locationToken
      ? unique([`${input.location} ${term}`, `${locationToken} ${term}`, term])
      : [`${input.location} ${term}`];
    const places = (
      await Promise.all(
        lookupQueries.map((query) =>
          locationToken
            ? input.kakaoLocal.keywordSearch(query, undefined, undefined, undefined, 3)
            : input.kakaoLocal.keywordSearch(query, input.origin.lng, input.origin.lat, input.radiusM, 2)
        )
      )
    ).flat();
    const matched = places
      .filter((place) => categoryMatches(place, input.category))
      .filter((place) => !locationToken || placeMatchesBroadLocation(place, locationToken))
      .filter((place) => !locationToken || evidencePlaceRelevance(place, evidence, term) >= 8)
      .sort((a, b) => evidencePlaceRelevance(b, evidence, term) - evidencePlaceRelevance(a, evidence, term))
      .slice(0, 1)
      .map((place) => ({
        ...place,
        searchAliases: unique([term, ...(place.searchAliases ?? [])]),
        discoveryEvidence: uniqueEvidence([evidence, ...(place.discoveryEvidence ?? [])])
      }));
    discovered.push(...matched);
    if (matched.length > 0) usedEvidence.add(key);
  }
  return mergePlaceCandidates(discovered, []).slice(0, input.limit);
}
