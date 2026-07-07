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

export function buildReviewQueries(context: ReviewQueryContext, maxQueries = 5): string[] {
  const knownCategories = new Set(["cafe", "restaurant", "culture", "museum", "restroom", "charger", "any"]);
  const category =
    context.category && knownCategories.has(String(context.category))
      ? categoryKeyword(context.category as Category)
      : context.category;
  const baseParts = [context.placeName, context.neighborhood];
  const candidates = [
    compact([...baseParts, "휠체어 접근성"]),
    compact([...baseParts, "휠체어 출입 가능"]),
    compact([...baseParts, "문턱 없음 경사로"]),
    compact([...baseParts, "계단 엘리베이터"]),
    compact([...baseParts, "장애인 화장실"]),
    compact([...baseParts, "유모차 휠체어"]),
    compact([context.placeName, context.district, "무장애 배리어프리"]),
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
  const unique = [...prioritized, ...candidates].filter(
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
