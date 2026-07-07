import type { NormalizedSearchResult, PlaceCandidate } from "../types.js";
import { categoryKeyword } from "../core/categoryMapper.js";
import { extractAddressToken, extractDistrict, normalizeText } from "../core/normalize.js";

export interface PlaceRelevanceContext {
  placeName: string;
  neighborhood?: string;
  district?: string;
  addressToken?: string;
  category?: string;
}

export function placeToRelevanceContext(
  place: Pick<PlaceCandidate, "name" | "address" | "roadAddress" | "category">,
  neighborhood?: string
): PlaceRelevanceContext {
  const address = place.roadAddress ?? place.address;
  const category =
    typeof place.category === "string" && !["cafe", "restaurant", "culture", "museum", "restroom", "charger", "any"].includes(place.category)
      ? place.category
      : categoryKeyword((place.category as never) ?? "any");
  return {
    placeName: place.name,
    neighborhood,
    district: extractDistrict(address),
    addressToken: extractAddressToken(address),
    category
  };
}

function includesNeedle(text: string, needle?: string): boolean {
  const normalizedNeedle = normalizeText(needle);
  if (!normalizedNeedle) return false;
  return text.includes(normalizedNeedle);
}

export function calculatePlaceRelevance(
  result: Pick<NormalizedSearchResult, "title" | "snippet">,
  context: PlaceRelevanceContext
): number {
  const text = normalizeText(`${result.title} ${result.snippet}`);
  let score = 0;
  if (includesNeedle(text, context.placeName)) score += 0.45;
  if (includesNeedle(text, context.neighborhood)) score += 0.2;
  if (includesNeedle(text, context.district) || includesNeedle(text, context.addressToken)) score += 0.15;
  if (includesNeedle(text, context.category)) score += 0.1;
  return Math.min(1, Number(score.toFixed(2)));
}
