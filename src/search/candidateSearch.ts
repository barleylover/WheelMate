import { categoryKeyword, kakaoCategoryCode } from "../core/categoryMapper.js";
import { distanceMeters } from "../core/distance.js";
import type { Category, Origin, PlaceCandidate } from "../types.js";
import { mapWithConcurrency } from "../utils/concurrency.js";
import type { ResolvedSearchIntent } from "./intentResolver.js";
import { regionAddressToken } from "./locationScope.js";

export interface PlaceSearchProvider {
  searchNearbyPlaces(location: string, origin: Origin, category: Category, radiusM: number, limit: number): Promise<PlaceCandidate[]>;
  categorySearch(categoryGroupCode: string, x: number, y: number, radius: number, size?: number, page?: number): Promise<PlaceCandidate[]>;
  keywordSearchPage(query: string, options?: {
    x?: number;
    y?: number;
    radius?: number;
    size?: number;
    page?: number;
    sort?: "accuracy" | "distance";
    categoryGroupCode?: string;
  }): Promise<PlaceCandidate[]>;
}

export interface CandidatePoolDiagnostics {
  strategies: Record<string, number>;
  raw_count: number;
  category_matched_count: number;
  area_matched_count: number;
  content_matched_count: number;
  hard_content_filter_applied: boolean;
  hard_content_filtered_count: number;
  content_relaxed: boolean;
}

export interface CandidatePoolResult {
  candidates: PlaceCandidate[];
  diagnostics: CandidatePoolDiagnostics;
}

interface CandidateRecord {
  place: PlaceCandidate;
  strategies: Set<string>;
  contentMatches: string[];
  queryMatchedContent: Set<string>;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function keyForPlace(place: PlaceCandidate): string {
  return place.sourcePlaceId || `${place.name}:${place.roadAddress ?? place.address ?? ""}`.replace(/\s+/g, "").toLowerCase();
}

export function candidateMatchesCategory(place: PlaceCandidate, category: Category): boolean {
  const text = `${place.category ?? ""} ${place.name}`;
  if (category === "any") return true;
  if (category === "cafe") {
    if (/(?:카페거리|거리|골목|상권|마을)$/.test(place.name)) return false;
    return /카페|커피|디저트|베이커리|제과/.test(text);
  }
  if (category === "restaurant") {
    if (/카페|커피|디저트|베이커리|제과|아이스크림|빙수/.test(text)) return false;
    return /음식점|식당|한식|중식|일식|양식|분식|고기|레스토랑|맛집|국수|요리/.test(text);
  }
  if (category === "museum") return /박물관|미술관|전시/.test(text);
  if (category === "culture") return /문화|공연|전시|박물관|미술관|도서관|영화관/.test(text);
  if (category === "restroom") return /화장실/.test(text);
  if (category === "charger") return /휠체어|충전/.test(text);
  return true;
}

function contentMatches(place: PlaceCandidate, terms: string[]): string[] {
  const text = `${place.name} ${place.category} ${(place.searchAliases ?? []).join(" ")}`.toLowerCase();
  return terms.filter((term) => {
    if (term === "회") return /(?:^|[\s>,])회(?:$|[\s>,])|횟집|회센터|생선회/.test(text);
    return text.includes(term.toLowerCase());
  });
}

export function candidateWithinIntentArea(place: PlaceCandidate, intent: ResolvedSearchIntent, origin: Origin): boolean {
  if (intent.scope === "region") {
    const region = regionAddressToken(intent.location);
    return Boolean(region && `${place.address ?? ""} ${place.roadAddress ?? ""}`.includes(region));
  }
  const distance = distanceMeters(origin, place);
  return Number.isFinite(distance) && distance <= intent.radiusM;
}

function attachDistance(place: PlaceCandidate, intent: ResolvedSearchIntent, origin: Origin): PlaceCandidate {
  if (intent.scope === "region") return place;
  const distance = place.distance_m ?? distanceMeters(origin, place);
  return Number.isFinite(distance) ? { ...place, distance_m: Math.round(distance) } : place;
}

function strategyScore(strategies: Set<string>): number {
  let score = 0;
  if (strategies.has("content_keyword")) score += 60;
  if (strategies.has("location_category_keyword")) score += 30;
  if (strategies.has("regional_keyword")) score += 25;
  if (strategies.has("category_nearby")) score += 15;
  if (strategies.has("category_page_2")) score += 10;
  return score;
}

function candidateScore(record: CandidateRecord): number {
  const content = record.contentMatches.length > 0 ? 200 + record.contentMatches.length * 20 : 0;
  const distance = record.place.distance_m === undefined ? 0 : Math.max(0, 50 - record.place.distance_m / 200);
  return content + strategyScore(record.strategies) + distance;
}

export async function buildCandidatePool(input: {
  intent: ResolvedSearchIntent;
  origin: Origin;
  provider: PlaceSearchProvider;
  poolLimit?: number;
}): Promise<CandidatePoolResult> {
  const poolLimit = Math.min(30, Math.max(8, input.poolLimit ?? 15));
  const categoryCode = kakaoCategoryCode(input.intent.category);
  const tasks: Array<{ strategy: string; contentTerm?: string; run: () => Promise<PlaceCandidate[]> }> = [];

  if (categoryCode) {
    tasks.push({
      strategy: "category_nearby",
      run: () => input.provider.categorySearch(
        categoryCode,
        input.origin.lng,
        input.origin.lat,
        input.intent.radiusM,
        15,
        1
      )
    });
    if (input.intent.scope === "region") {
      tasks.push({
        strategy: "category_page_2",
        run: () => input.provider.categorySearch(
          categoryCode,
          input.origin.lng,
          input.origin.lat,
          input.intent.radiusM,
          15,
          2
        )
      });
    }
  } else {
    tasks.push({
      strategy: "category_nearby",
      run: () => input.provider.searchNearbyPlaces(
        input.intent.location,
        input.origin,
        input.intent.category,
        input.intent.radiusM,
        15
      )
    });
  }

  if (input.intent.scope === "point") {
    const label = categoryKeyword(input.intent.category) || "장소";
    tasks.push({
      strategy: "location_category_keyword",
      run: () => input.provider.keywordSearchPage(`${input.intent.location} ${label}`, {
        x: input.origin.lng,
        y: input.origin.lat,
        radius: input.intent.radiusM,
        size: 15,
        page: 1,
        sort: "accuracy",
        categoryGroupCode: categoryCode
      })
    });
  }

  const primaryContentTerms = unique(input.intent.contentPreferences).slice(0, 2);
  for (const term of primaryContentTerms) {
    tasks.push({
      strategy: "content_keyword",
      contentTerm: term,
      run: () => input.provider.keywordSearchPage(`${input.intent.location} ${term}`, {
        x: input.intent.scope === "point" ? input.origin.lng : undefined,
        y: input.intent.scope === "point" ? input.origin.lat : undefined,
        radius: input.intent.scope === "point" ? input.intent.radiusM : undefined,
        size: 15,
        page: 1,
        sort: input.intent.scope === "point" ? "distance" : "accuracy",
        categoryGroupCode: categoryCode
      })
    });
  }

  if (input.intent.scope === "region") {
    const label = categoryKeyword(input.intent.category) || "장소";
    tasks.push({
      strategy: "regional_keyword",
      run: () => input.provider.keywordSearchPage(`${input.intent.location} ${label}`, {
        size: 15,
        page: 1,
        sort: "accuracy",
        categoryGroupCode: categoryCode
      })
    });
  }

  const results = await mapWithConcurrency(tasks, Math.min(4, tasks.length || 1), async (task) => ({
    strategy: task.strategy,
    contentTerm: task.contentTerm,
    places: await task.run()
  }));
  const records = new Map<string, CandidateRecord>();
  const strategyCounts: Record<string, number> = {};
  for (const result of results) {
    strategyCounts[result.strategy] = (strategyCounts[result.strategy] ?? 0) + result.places.length;
    for (const place of result.places) {
      const key = keyForPlace(place);
      const current = records.get(key);
      if (current) {
        current.strategies.add(result.strategy);
        if (result.contentTerm) current.queryMatchedContent.add(result.contentTerm);
        continue;
      }
      records.set(key, {
        place: attachDistance(place, input.intent, input.origin),
        strategies: new Set([result.strategy]),
        contentMatches: [],
        queryMatchedContent: new Set(result.contentTerm ? [result.contentTerm] : [])
      });
    }
  }

  const rawRecords = [...records.values()];
  const categoryRecords = rawRecords.filter((record) => candidateMatchesCategory(record.place, input.intent.category));
  const areaRecords = categoryRecords.filter((record) => candidateWithinIntentArea(record.place, input.intent, input.origin));
  for (const record of areaRecords) {
    record.contentMatches = unique([
      ...contentMatches(record.place, input.intent.contentPreferences),
      ...record.queryMatchedContent
    ]);
    if (record.contentMatches.length > 0) {
      record.place.searchAliases = unique([...(record.place.searchAliases ?? []), ...record.contentMatches]);
    }
  }
  const contentMatchedCount = areaRecords.filter((record) => record.contentMatches.length > 0).length;
  const hardContentFilterApplied = input.intent.hardContentFilter && input.intent.contentPreferences.length > 0;
  const eligibleRecords = hardContentFilterApplied
    ? areaRecords.filter((record) => record.contentMatches.length > 0)
    : areaRecords;
  const contentRelaxed = !hardContentFilterApplied && input.intent.contentPreferences.length > 0 && contentMatchedCount === 0;
  const candidates = eligibleRecords
    .sort((a, b) => candidateScore(b) - candidateScore(a))
    .slice(0, poolLimit)
    .map((record) => record.place);

  return {
    candidates,
    diagnostics: {
      strategies: strategyCounts,
      raw_count: rawRecords.length,
      category_matched_count: categoryRecords.length,
      area_matched_count: areaRecords.length,
      content_matched_count: contentMatchedCount,
      hard_content_filter_applied: hardContentFilterApplied,
      hard_content_filtered_count: Math.max(0, areaRecords.length - eligibleRecords.length),
      content_relaxed: contentRelaxed
    }
  };
}
