import type { Category, PlaceCandidate } from "../types.js";
import { categoryKeyword } from "../core/categoryMapper.js";
import { extractAddressToken, extractDistrict } from "../core/normalize.js";

export interface ReviewQueryContext {
  placeName: string;
  neighborhood?: string;
  district?: string;
  addressToken?: string;
  category?: Category | string;
  preferences?: string[];
}

export function buildReviewQueryContext(
  place: Pick<PlaceCandidate, "name" | "address" | "roadAddress" | "category">,
  neighborhood?: string,
  preferences: string[] = []
): ReviewQueryContext {
  const address = place.roadAddress ?? place.address;
  return {
    placeName: place.name,
    neighborhood,
    district: extractDistrict(address),
    addressToken: extractAddressToken(address),
    category: place.category,
    preferences
  };
}

function compact(parts: Array<string | undefined>): string {
  return parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

function neighborhoodForQuery(placeName: string, neighborhood?: string): string | undefined {
  if (!neighborhood) return undefined;
  const compactPlace = placeName.replace(/\s+/g, "").toLowerCase();
  const locationTokens = neighborhood
    .split(/\s+/)
    .map((item) => item.replace(/\s+/g, "").toLowerCase())
    .filter((item) => item.length >= 2);
  return locationTokens.some((token) => compactPlace.includes(token)) ? undefined : neighborhood;
}

export function buildReviewQueries(context: ReviewQueryContext, maxQueries = 5): string[] {
  const knownCategories = new Set(["cafe", "restaurant", "culture", "museum", "restroom", "charger", "any"]);
  const category =
    context.category && knownCategories.has(String(context.category))
      ? categoryKeyword(context.category as Category)
      : context.category;
  // Repeating a branch location (for example, "잠실역점 잠실역") makes
  // search-engine matching unnecessarily strict. Keep the location only when
  // the concrete Kakao place name does not already contain it.
  const baseParts = [context.placeName, neighborhoodForQuery(context.placeName, context.neighborhood)];
  const candidates = [
    compact([...baseParts, "휠체어"]),
    compact([...baseParts, "장애인 편의시설"]),
    compact([...baseParts, "휠체어 이용 가능"]),
    compact([...baseParts, "문턱 경사로 엘리베이터"]),
    compact([context.placeName, context.district, "배리어프리 무장애"]),
    compact([context.placeName, context.addressToken, category, "휠체어"])
  ].filter(Boolean);

  const priorities: string[] = [];
  const preferences = new Set(context.preferences ?? []);
  if (preferences.has("입구중요") || preferences.has("계단회피")) {
    priorities.push("문턱 경사로 계단");
  }
  if (preferences.has("장애인화장실")) {
    priorities.push("장애인 화장실");
  }
  if (preferences.has("엘리베이터")) {
    priorities.push("엘리베이터 계단");
  }

  const prioritized = priorities.map((term) => compact([...baseParts, term]));
  // Always retain one high-recall wheelchair query before preference-specific
  // variants. This prevents a narrow preference from consuming the complete
  // per-candidate search budget.
  const unique = [candidates[0], ...prioritized, ...candidates.slice(1)].filter(
    (query, index, all) => query && all.indexOf(query) === index
  );
  return unique.slice(0, maxQueries);
}

export function splitPreferences(preferences: string[] = []): {
  supported: string[];
  unsupported: string[];
} {
  const supportedNames = new Set(["장애인화장실", "충전기근처", "입구중요", "계단회피", "엘리베이터"]);
  const supported: string[] = [];
  const unsupported: string[] = [];
  for (const preference of preferences) {
    if (supportedNames.has(preference)) {
      supported.push(preference);
    } else {
      unsupported.push(preference);
    }
  }
  return { supported, unsupported };
}
