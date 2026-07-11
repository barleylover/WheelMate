import { categoryKeyword, kakaoCategoryCode } from "../core/categoryMapper.js";
import type { Origin, PlaceCandidate, ReviewEvidence, SearchSource, SourceSearchOutcome } from "../types.js";
import {
  assessPlaceRelevance,
  placeEvidenceIsRecommendationSafe,
  placeToRelevanceContext
} from "../reviewSearch/placeRelevance.js";
import { extractSignals } from "../reviewSearch/signalExtractor.js";
import { evidenceIdentity } from "../reviewSearch/evidenceIdentity.js";
import type { ResolvedSearchIntent } from "./intentResolver.js";
import {
  candidateMatchesCategory,
  candidateWithinIntentArea,
  type PlaceSearchProvider
} from "./candidateSearch.js";

export interface BroadEvidenceDiagnostics {
  queries: string[];
  calls: number;
  results: number;
  matched_candidates: number;
  matched_evidence: number;
  unavailable_calls: number;
  unavailable_sources: Partial<Record<SearchSource, string>>;
  lookup_calls: number;
  lookup_terms: string[];
  discovered_candidates: number;
  discovered_places: string[];
}

export interface SearchQueryRunner {
  searchQueries(queries: string[], maxCalls?: number): Promise<SourceSearchOutcome[]>;
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.replace(/\s+/g, " ").trim()).filter(Boolean))];
}

interface LookupTerm {
  term: string;
  evidence: ReviewEvidence;
  priority: number;
}

const GENERIC_LOOKUP_TERMS = new Set([
  "카페", "식당", "음식점", "맛집", "서울", "부산", "제주", "잠실", "서면", "후기", "추천",
  "배리어프리", "무장애", "휠체어", "접근성", "여행", "투어", "정보", "가볼만한곳",
  "디저트", "가능", "이다", "입니다", "장소", "메뉴", "오늘", "오늘은", "기본", "관광",
  "말고기", "고등어회", "육회", "참치회", "생선회", "출입", "내부"
]);

function cleanLookupTerm(value: string, location: string): string | null {
  const cleaned = value
    .replace(/<[^>]*>/g, " ")
    .replace(new RegExp(location.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/(?:휠체어|접근성|접근\s*가능|출입\s*가능|문턱|경사로|배리어프리|무장애|후기|추천|정보|맛집|가능)/g, " ")
    .replace(/[|｜:;!?_,/+.·]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/([가-힣A-Za-z0-9&_-]{2,20})(?:입니다|이다|에서|은|는|이|가|을|를|의)$/g, "$1")
    .trim();
  const compact = cleaned.replace(/\s+/g, "");
  if (compact.length < 2 || compact.length > 24 || GENERIC_LOOKUP_TERMS.has(compact)) return null;
  const withoutCategory = compact.replace(/^(?:카페|커피|식당|음식점|횟집|맛집)/, "");
  if (withoutCategory.length < 2 || GENERIC_LOOKUP_TERMS.has(withoutCategory) || /^\d+곳/.test(withoutCategory)) return null;
  if (/^\d+(?:\.?(?:\s+)?\d+)*$/.test(cleaned)) return null;
  if (/(?:상가\s*임대|지원\s*안내|지원사업|다양한\s*업종|들을\s*수\s*있는)/.test(cleaned)) return null;
  if (/(?:여행|투어|가볼만한곳|정리|모음|설치|해야)$/.test(compact)) return null;
  return cleaned;
}

function lookupTermMatchesCategory(term: string, intent: ResolvedSearchIntent): boolean {
  const compact = term.replace(/\s+/g, "");
  if (intent.category === "restaurant") {
    return !/(?:카페|커피|필라테스|편의점|마트)/.test(compact);
  }
  if (intent.category === "cafe") {
    return !/(?:음식점|식당|횟집|국밥|고깃집)/.test(compact);
  }
  return true;
}

function titleLookupTerms(evidence: ReviewEvidence, intent: ResolvedSearchIntent): LookupTerm[] {
  const title = evidence.title.replace(/<[^>]*>/g, " ");
  const combined = `${title} ${evidence.snippet}`;
  const raw: Array<{ value: string; priority: number }> = [
    ...Array.from(title.matchAll(/\]\s*([가-힣A-Za-z0-9&.·_-]{2,20})/g)).map((match) => ({ value: match[1] ?? "", priority: 7 })),
    ...Array.from(combined.matchAll(/(?:카페|식당|음식점|횟집|맛집)\s*['"‘’“”]\s*([^'"‘’“”]{2,24})['"‘’“”]/g)).map((match) => ({ value: match[1] ?? "", priority: 6 })),
    ...Array.from(title.matchAll(/['"‘’“”]([^'"‘’“”]{2,24})['"‘’“”]/g)).map((match) => ({ value: match[1] ?? "", priority: 5 })),
    ...Array.from(combined.matchAll(/(?:카페|식당|음식점|횟집|맛집)\s+([가-힣A-Za-z0-9&.·_-]{2,20})/g)).map((match) => ({
      value: `${match[0]?.startsWith("카페") ? "카페 " : ""}${match[1] ?? ""}`,
      priority: 4
    })),
    ...Array.from(title.matchAll(/([가-힣A-Za-z0-9&.·_-]{2,20}(?:커피|카페|식당|횟집))/g)).map((match) => ({ value: match[1] ?? "", priority: 4 })),
    ...title.split(/\s*[-–—|｜:]\s*/).slice(0, 2).map((value, index) => ({ value, priority: index === 0 ? 3 : 2 }))
  ];
  return raw.flatMap(({ value, priority }) => {
    const term = cleanLookupTerm(value, intent.location);
    return term && lookupTermMatchesCategory(term, intent) ? [{ term, evidence, priority }] : [];
  });
}

function lookupKey(place: PlaceCandidate): string {
  return place.sourcePlaceId || `${place.name}:${place.roadAddress ?? place.address ?? ""}`.replace(/\s+/g, "");
}

async function discoverCandidatesFromEvidence(input: {
  intent: ResolvedSearchIntent;
  origin: Origin;
  outcomes: SourceSearchOutcome[];
  provider: PlaceSearchProvider;
  maxLookups: number;
}): Promise<{ candidates: PlaceCandidate[]; lookupCalls: number; lookupTerms: string[] }> {
  const evidence = input.outcomes.flatMap((outcome) => outcome.results).flatMap((result) => {
    const item: ReviewEvidence = { ...result, place_match_score: 0, signals: extractSignals(result) };
    return recommendationSignal(item) ? [item] : [];
  });
  const terms = evidence
    .flatMap((item) => titleLookupTerms(item, input.intent))
    .sort((a, b) => b.priority - a.priority)
    .filter((item, index, all) => all.findIndex((other) =>
      other.term.replace(/\s+/g, "") === item.term.replace(/\s+/g, "")
    ) === index)
    .slice(0, input.maxLookups);
  const discovered = new Map<string, PlaceCandidate>();
  let lookupCalls = 0;
  for (const item of terms) {
    lookupCalls += 1;
    const places = await input.provider.keywordSearchPage(`${input.intent.location} ${item.term}`, {
      x: input.intent.scope === "point" ? input.origin.lng : undefined,
      y: input.intent.scope === "point" ? input.origin.lat : undefined,
      radius: input.intent.scope === "point" ? input.intent.radiusM : undefined,
      size: 3,
      page: 1,
      sort: input.intent.scope === "point" ? "distance" : "accuracy",
      categoryGroupCode: kakaoCategoryCode(input.intent.category)
    });
    for (const place of places) {
      if (!candidateMatchesCategory(place, input.intent.category)) continue;
      if (!candidateWithinIntentArea(place, input.intent, input.origin)) continue;
      const relevance = assessPlaceRelevance(
        item.evidence,
        placeToRelevanceContext(place, input.intent.scope === "point" ? input.intent.location : undefined)
      );
      // Discovery is the highest-risk boundary: this result creates a new
      // venue candidate. Require the complete Kakao place name in the search
      // result rather than accepting a brand alias or area-only coincidence.
      if (relevance.name_match !== "exact") continue;
      if (!placeEvidenceIsRecommendationSafe(item.evidence, relevance, item.evidence.signals)) continue;
      const attachedEvidence: ReviewEvidence = {
        ...item.evidence,
        place_match_score: relevance.score,
        place_name_match: relevance.name_match,
        place_matched_name: relevance.matched_name,
        place_matched_field: relevance.matched_field,
        place_location_match: relevance.location_match,
        attribution_verified: true
      };
      const key = lookupKey(place);
      const current = discovered.get(key);
      discovered.set(key, {
        ...place,
        discoveryEvidence: uniqueEvidence([...(current?.discoveryEvidence ?? []), attachedEvidence])
      });
    }
  }
  return { candidates: [...discovered.values()], lookupCalls, lookupTerms: terms.map((item) => item.term) };
}

export function buildBroadEvidenceQueries(intent: ResolvedSearchIntent): string[] {
  const category = categoryKeyword(intent.category) || "장소";
  const targets = intent.contentPreferences.length > 0
    ? unique(intent.contentPreferences.slice(0, 2))
    : [category];
  return unique([
    ...targets.map((target) => `${intent.location} ${target} 휠체어 출입`),
    ...targets.map((target) => `${intent.location} ${target} 문턱 경사로`),
    `${intent.location} ${category} 배리어프리`
  ]).slice(0, 5);
}

function recommendationSignal(evidence: ReviewEvidence): boolean {
  return evidence.signals.some((signal) =>
    signal.polarity === "positive" &&
    (!signal.subject || signal.subject === "venue") &&
    !["basement_or_floor", "stroller_proxy", "unknown"].includes(signal.type)
  );
}

function uniqueEvidence(evidence: ReviewEvidence[]): ReviewEvidence[] {
  const seen = new Set<string>();
  return evidence.filter((item) => {
    const key = evidenceIdentity(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function matchOutcomesToCandidate(
  place: PlaceCandidate,
  intent: ResolvedSearchIntent,
  outcomes: SourceSearchOutcome[]
): ReviewEvidence[] {
  const context = placeToRelevanceContext(place, intent.scope === "point" ? intent.location : undefined);
  const matched = outcomes.flatMap((outcome) => outcome.results).flatMap((result) => {
    const relevance = assessPlaceRelevance(result, context);
    if (relevance.score < 0.48) return [];
    const evidence: ReviewEvidence = {
      ...result,
      place_match_score: relevance.score,
      place_name_match: relevance.name_match,
      place_matched_name: relevance.matched_name,
      place_matched_field: relevance.matched_field,
      place_location_match: relevance.location_match,
      signals: extractSignals(result)
    };
    return recommendationSignal(evidence) && placeEvidenceIsRecommendationSafe(result, relevance, evidence.signals)
      ? [{ ...evidence, attribution_verified: true }]
      : [];
  });
  return uniqueEvidence(matched);
}

export async function attachBroadAccessibilityEvidence(input: {
  intent: ResolvedSearchIntent;
  origin: Origin;
  candidates: PlaceCandidate[];
  reviewSearch: SearchQueryRunner;
  placeProvider: PlaceSearchProvider;
  maxCalls: number;
  maxLookups?: number;
}): Promise<{ candidates: PlaceCandidate[]; diagnostics: BroadEvidenceDiagnostics }> {
  const queries = buildBroadEvidenceQueries(input.intent);
  const outcomes = await input.reviewSearch.searchQueries(queries, input.maxCalls);
  const discovered = await discoverCandidatesFromEvidence({
    intent: input.intent,
    origin: input.origin,
    outcomes,
    provider: input.placeProvider,
    maxLookups: input.maxLookups ?? 6
  });
  const mergedCandidates = new Map(input.candidates.map((place) => [lookupKey(place), place]));
  for (const place of discovered.candidates) {
    const key = lookupKey(place);
    const current = mergedCandidates.get(key);
    mergedCandidates.set(key, current
      ? { ...current, discoveryEvidence: uniqueEvidence([...(current.discoveryEvidence ?? []), ...(place.discoveryEvidence ?? [])]) }
      : place);
  }
  const originalOrder = new Map(input.candidates.map((place, index) => [
    place.sourcePlaceId || `${place.name}:${place.roadAddress ?? place.address ?? ""}`,
    index
  ]));
  let matchedCandidates = 0;
  let matchedEvidence = 0;
  const candidates = [...mergedCandidates.values()].map((place) => {
    const evidence = matchOutcomesToCandidate(place, input.intent, outcomes);
    if (evidence.length === 0) return place;
    matchedCandidates += 1;
    matchedEvidence += evidence.length;
    return {
      ...place,
      discoveryEvidence: uniqueEvidence([...(place.discoveryEvidence ?? []), ...evidence])
    };
  }).sort((a, b) => {
    const evidenceDiff = (b.discoveryEvidence?.length ?? 0) - (a.discoveryEvidence?.length ?? 0);
    if (evidenceDiff !== 0) return evidenceDiff;
    const keyA = a.sourcePlaceId || `${a.name}:${a.roadAddress ?? a.address ?? ""}`;
    const keyB = b.sourcePlaceId || `${b.name}:${b.roadAddress ?? b.address ?? ""}`;
    return (originalOrder.get(keyA) ?? Number.POSITIVE_INFINITY) -
      (originalOrder.get(keyB) ?? Number.POSITIVE_INFINITY);
  });

  return {
    candidates,
    diagnostics: {
      queries,
      calls: outcomes.length,
      results: outcomes.reduce((sum, outcome) => sum + outcome.results.length, 0),
      matched_candidates: matchedCandidates,
      matched_evidence: matchedEvidence,
      unavailable_calls: outcomes.filter((outcome) => outcome.unavailable).length,
      unavailable_sources: Object.fromEntries(
        outcomes
          .filter((outcome) => outcome.unavailable)
          .map((outcome) => [outcome.source, outcome.error ?? "unavailable"])
      ),
      lookup_calls: discovered.lookupCalls,
      lookup_terms: discovered.lookupTerms,
      discovered_candidates: discovered.candidates.length,
      discovered_places: discovered.candidates.map((place) => place.name)
    }
  };
}
