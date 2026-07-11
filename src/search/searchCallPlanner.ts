import type { SearchSource } from "../types.js";

export interface PlannedSearchCall {
  query: string;
  source: SearchSource;
}

const SOURCE_PRIORITY: SearchSource[] = [
  "naver_blog",
  "daum_blog",
  "naver_web",
  "daum_web",
  "naver_cafe",
  "daum_cafe"
];

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.replace(/\s+/g, " ").trim()).filter(Boolean))];
}

/**
 * Builds a provider-balanced plan. The previous query-major Cartesian product
 * spent a four-call candidate budget on one wording across four sources. This
 * planner first covers two independent providers for each useful wording, then
 * adds web/cafe breadth only when budget remains.
 */
export function buildBalancedSearchCalls(
  queries: string[],
  enabledSources: SearchSource[],
  maxCalls: number
): PlannedSearchCall[] {
  const normalizedQueries = unique(queries);
  const sources = SOURCE_PRIORITY.filter((source) => enabledSources.includes(source));
  const limit = Math.max(0, Math.floor(maxCalls));
  if (normalizedQueries.length === 0 || sources.length === 0 || limit === 0) return [];

  const sourceGroups: SearchSource[][] = [
    sources.filter((source) => source.endsWith("_blog")),
    sources.filter((source) => source.endsWith("_web")),
    sources.filter((source) => source.endsWith("_cafe"))
  ].filter((group) => group.length > 0);
  const calls: PlannedSearchCall[] = [];
  const seen = new Set<string>();

  const append = (source: SearchSource, query: string): boolean => {
    const key = `${source}:${query}`;
    if (seen.has(key)) return false;
    seen.add(key);
    calls.push({ source, query });
    return calls.length >= limit;
  };

  // First secure independent-provider coverage for the two most useful
  // wordings. Then add a web surface for the primary wording before spending
  // calls on lower-priority query variants. This keeps six-call plans diverse.
  const blogs = sourceGroups.find((group) => group.some((source) => source.endsWith("_blog"))) ?? [];
  for (const query of normalizedQueries.slice(0, 2)) {
    for (const source of blogs) {
      if (append(source, query)) return calls;
    }
  }
  const webs = sourceGroups.find((group) => group.some((source) => source.endsWith("_web"))) ?? [];
  for (const source of webs) {
    if (append(source, normalizedQueries[0]!)) return calls;
  }

  for (const group of sourceGroups) {
    for (const query of normalizedQueries) {
      for (const source of group) {
        if (append(source, query)) return calls;
      }
    }
  }
  return calls;
}

/** Reserves actual-call capacity for transient retries when a budget exists. */
export function logicalSearchCallLimit(requested: number, budgetRemaining?: number): number {
  const requestedLimit = Math.max(0, Math.floor(requested));
  if (budgetRemaining === undefined) return requestedLimit;
  const available = Math.min(requestedLimit, Math.max(0, Math.floor(budgetRemaining)));
  if (available >= 8) return available - Math.max(2, Math.ceil(available * 0.2));
  if (available >= 4) return available - 1;
  return available;
}
