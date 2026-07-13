import type { NormalizedSearchResult, PlaceCandidate, ReviewSignal } from "../types.js";
import { categoryKeyword } from "../core/categoryMapper.js";
import { extractAddressToken, extractDistrict, normalizeText } from "../core/normalize.js";

export interface PlaceRelevanceContext {
  placeName: string;
  neighborhood?: string;
  district?: string;
  addressToken?: string;
  category?: string;
}

export interface PlaceRelevanceAssessment {
  score: number;
  name_match: "exact" | "alias" | "none";
  matched_name?: string;
  matched_field?: "title" | "snippet";
  location_match: boolean;
  location_required: boolean;
}

const GENERIC_NAME_TOKENS = new Set([
  "카페", "커피", "식당", "음식점", "맛집", "본점", "지점", "서면점", "강남점", "홍대점"
]);

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

function compact(value: string | undefined): string {
  return normalizeText(value).replace(/\s+/g, "");
}

function includesNeedle(text: string, needle?: string): boolean {
  const normalizedNeedle = normalizeText(needle);
  if (!normalizedNeedle) return false;
  return text.includes(normalizedNeedle) || compact(text).includes(compact(normalizedNeedle));
}

function locationNeedles(value?: string): string[] {
  const normalized = normalizeText(value);
  if (!normalized) return [];
  const tokens = normalized.split(/\s+/).filter(Boolean);
  const mostSpecificToken = tokens.at(-1) ?? normalized;
  const variants = [normalized, mostSpecificToken];
  const withoutLocalSuffix = mostSpecificToken.replace(
    /(?:특별자치도|특별자치시|특별시|광역시|역|동|시|군|구|도)$/u,
    ""
  );
  if (withoutLocalSuffix.length >= 2) variants.push(withoutLocalSuffix);
  return [...new Set(variants.map(compact).filter((token) => token.length >= 2))];
}

function includesAnyLocation(text: string, value?: string): boolean {
  const compactText = compact(text);
  return locationNeedles(value).some((needle) => compactText.includes(needle));
}

function requiresLocationCorroboration(placeName: string): boolean {
  const normalized = normalizeText(placeName);
  return compact(normalized).length <= 4 || /(?:본점|직영점|지점|점)$/u.test(normalized);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsShortExactName(text: string, name: string): boolean {
  const normalizedName = normalizeText(name);
  if (compact(normalizedName).length !== 2) return false;
  const matcher = new RegExp(
    `(?:^|\\s)${escapeRegExp(normalizedName)}(?=\\s|$|은|는|이|가|의|을|를|에|에서|로|와|과)`,
    "gu"
  );
  for (const match of text.matchAll(matcher)) {
    const index = match.index ?? 0;
    const context = text.slice(Math.max(0, index - 18), Math.min(text.length, index + match[0].length + 18));
    if (/(?:카페|커피|식당|음식점|맛집|횟집|레스토랑|매장|가게|본점|지점)/.test(context)) {
      return true;
    }
  }
  return false;
}

interface RelevanceField {
  name: "title" | "snippet";
  text: string;
  compact: string;
}

function canonicalBranch(value: string): string {
  return value
    .replace(/(?:본점|직영점|지점|점)$/g, "")
    .replace(/역(?=지하|상가|$)/g, "");
}

function branchAwareExactField(
  fields: RelevanceField[],
  placeName: string
): { field: RelevanceField; matchedName: string } | undefined {
  const tokens = normalizeText(placeName).split(/\s+/).filter(Boolean);
  const branchToken = tokens.at(-1);
  if (tokens.length < 2 || !branchToken || !/(?:본점|직영점|지점|점)$/.test(branchToken)) return undefined;

  const rawBrand = compact(tokens.slice(0, -1).join(" "));
  const canonicalBrand = rawBrand.replace(/[a-z]+/g, "");
  const branch = canonicalBranch(compact(branchToken));
  if (canonicalBrand.length < 3 || branch.length < 2 || GENERIC_NAME_TOKENS.has(canonicalBrand)) return undefined;

  for (const field of fields) {
    const canonicalField = field.compact
      .replace(/[a-z]+/g, "")
      .replace(/역(?=지하|상가|점|$)/g, "");
    const brandIndex = canonicalField.indexOf(canonicalBrand);
    const branchIndex = canonicalField.indexOf(branch);
    if (brandIndex < 0 || branchIndex < 0) continue;
    const brandEnd = brandIndex + canonicalBrand.length;
    const branchEnd = branchIndex + branch.length;
    const gap = Math.max(0, Math.max(brandIndex, branchIndex) - Math.min(brandEnd, branchEnd));
    if (gap > 10) continue;
    const matchedName = [rawBrand, canonicalBrand].find((value) => field.compact.includes(value));
    if (matchedName) return { field, matchedName };
  }
  return undefined;
}

export function placeNameVariants(placeName: string): string[] {
  const normalized = normalizeText(placeName);
  const compactFull = compact(normalized);
  const rawTokens = normalized.split(/\s+/).filter(Boolean);
  const coreTokens = [...rawTokens];
  if (coreTokens.length > 1 && /(?:본점|직영점|지점|점)$/.test(coreTokens.at(-1) ?? "")) {
    coreTokens.pop();
  }
  const withoutBranch = compact(coreTokens.join(" "));
  const brandToken = compact(coreTokens[0]);
  const aliases = [withoutBranch, brandToken].filter((token) =>
    token.length >= 3 &&
    token !== compactFull &&
    !GENERIC_NAME_TOKENS.has(token) &&
    !/(?:역|동|구|시|군|도|점)$/.test(token)
  );
  return [...new Set([compactFull, ...aliases])];
}

export function assessPlaceRelevance(
  result: Pick<NormalizedSearchResult, "title" | "snippet">,
  context: PlaceRelevanceContext
): PlaceRelevanceAssessment {
  const title = normalizeText(result.title);
  const snippet = normalizeText(result.snippet);
  const text = `${title} ${snippet}`.trim();
  // Never compact across the title/snippet boundary. Doing so can invent a
  // venue entity: a title ending in "카페" plus a snippet beginning with
  // "오늘은" previously matched the real Kakao place "카페오늘은".
  const fields: RelevanceField[] = [
    { name: "title" as const, text: title, compact: compact(title) },
    { name: "snippet" as const, text: snippet, compact: compact(snippet) }
  ];
  const variants = placeNameVariants(context.placeName);
  const exactName = compact(context.placeName);
  const locationRequired = requiresLocationCorroboration(context.placeName);
  let nameMatch: PlaceRelevanceAssessment["name_match"] = "none";
  let matchedName: string | undefined;
  let matchedField: PlaceRelevanceAssessment["matched_field"];
  let score = 0;

  const exactField = exactName.length >= 3
    ? fields.find((field) => field.compact.includes(exactName))
    : fields.find((field) => containsShortExactName(field.text, context.placeName));
  const branchExactField = exactField ? undefined : branchAwareExactField(fields, context.placeName);
  if (exactField) {
    nameMatch = "exact";
    matchedName = exactName;
    matchedField = exactField.name;
    score = 0.65;
  } else if (branchExactField) {
    nameMatch = "exact";
    matchedName = branchExactField.matchedName;
    matchedField = branchExactField.field.name;
    score = 0.65;
  } else {
    const aliasMatch = variants.flatMap((variant) =>
      variant === exactName
        ? []
        : fields.flatMap((field) => field.compact.includes(variant) ? [{ variant, field: field.name }] : [])
    )[0];
    if (aliasMatch) {
      nameMatch = "alias";
      matchedName = aliasMatch.variant;
      matchedField = aliasMatch.field;
      score = aliasMatch.variant.length >= 5 ? 0.55 : 0.48;
    }
  }

  // A neighborhood/category match without the place entity is not evidence
  // about that place. This hard boundary prevents generic area articles from
  // being attached to every nearby candidate.
  if (nameMatch === "none") {
    return { score: 0, name_match: "none", location_match: false, location_required: locationRequired };
  }

  const neighborhoodMatch = includesAnyLocation(text, context.neighborhood);
  const locationMatch = neighborhoodMatch ||
    includesNeedle(text, context.district) ||
    includesNeedle(text, context.addressToken);
  if (neighborhoodMatch) score += 0.15;
  if (includesNeedle(text, context.district) || includesNeedle(text, context.addressToken)) score += 0.1;
  if (includesNeedle(text, context.category)) score += 0.05;
  return {
    score: Math.min(1, Number(score.toFixed(2))),
    name_match: nameMatch,
    matched_name: matchedName,
    matched_field: matchedField,
    location_match: locationMatch,
    location_required: locationRequired
  };
}

export function calculatePlaceRelevance(
  result: Pick<NormalizedSearchResult, "title" | "snippet">,
  context: PlaceRelevanceContext
): number {
  return assessPlaceRelevance(result, context).score;
}

const MULTI_VENUE_TITLE = /(?:포함|모음|리스트|코스(?!요리)|여러\s*곳|\d+\s*곳|세\s*곳|곳을\s*소개)/;

function isMultiVenueTitle(value: string): boolean {
  if (MULTI_VENUE_TITLE.test(normalizeText(value))) return true;
  const quotedNames = value.match(/["'‘’“”][^"'‘’“”]{2,30}["'‘’“”]/g) ?? [];
  return quotedNames.length >= 2;
}

function qualifyingPositive(signal: ReviewSignal): boolean {
  return signal.polarity === "positive" &&
    (!signal.subject || signal.subject === "venue") &&
    !["basement_or_floor", "stroller_proxy", "unknown"].includes(signal.type);
}

function hasNearbySignal(field: string, placeName: string, signals: ReviewSignal[], maxDistance = 140): boolean {
  const normalizedField = compact(field);
  const normalizedName = compact(placeName);
  const nameIndex = normalizedField.indexOf(normalizedName);
  if (nameIndex < 0) return false;
  return signals.some((signal) => {
    if (!qualifyingPositive(signal)) return false;
    const signalText = compact(signal.matched_text);
    if (!signalText) return false;
    let signalIndex = normalizedField.indexOf(signalText);
    while (signalIndex >= 0) {
      const nameEnd = nameIndex + normalizedName.length;
      const signalEnd = signalIndex + signalText.length;
      const distance = Math.max(0, Math.max(nameIndex, signalIndex) - Math.min(nameEnd, signalEnd));
      if (distance <= maxDistance) return true;
      signalIndex = normalizedField.indexOf(signalText, signalIndex + 1);
    }
    return false;
  });
}

function hasSameSegmentSignal(field: string, placeName: string, signals: ReviewSignal[]): boolean {
  const segments = field.split(/\s*(?:[&|｜]|\s\/\s|\s\+\s)\s*|(?:^|\s)\d{1,2}[.)]\s+/g);
  return segments.some((segment) => hasNearbySignal(segment, placeName, signals, 80));
}

/**
 * Determines whether a positive accessibility phrase can be attributed to the
 * matched venue, rather than merely appearing elsewhere in a multi-venue
 * search result. This operates on title/snippet separately to preserve entity
 * boundaries.
 */
export function placeEvidenceIsAttributable(
  result: Pick<NormalizedSearchResult, "title" | "snippet">,
  assessment: PlaceRelevanceAssessment,
  signals: ReviewSignal[]
): boolean {
  if (assessment.name_match === "none" || !assessment.matched_name) return false;
  const positiveSignals = signals.filter(qualifyingPositive);
  if (positiveSignals.length === 0) return false;

  if (assessment.matched_field === "snippet") {
    return hasNearbySignal(result.snippet, assessment.matched_name, positiveSignals);
  }
  if (assessment.matched_field !== "title") return false;
  if (hasNearbySignal(result.title, assessment.matched_name, positiveSignals)) return true;

  // A single-venue title commonly names the venue while the snippet carries
  // the entrance detail. A list/roundup title does not provide that guarantee.
  if (isMultiVenueTitle(result.title)) {
    return hasSameSegmentSignal(result.snippet, assessment.matched_name, positiveSignals);
  }
  return positiveSignals.some((signal) => compact(result.snippet).includes(compact(signal.matched_text)));
}

/**
 * Final recommendation boundary. Alias matches remain useful diagnostics, but
 * are not strong enough to claim that accessibility evidence belongs to one
 * concrete Kakao place or branch.
 */
export function placeEvidenceIsRecommendationSafe(
  result: Pick<NormalizedSearchResult, "title" | "snippet">,
  assessment: PlaceRelevanceAssessment,
  signals: ReviewSignal[]
): boolean {
  return assessment.name_match === "exact" &&
    (!assessment.location_required || assessment.location_match) &&
    placeEvidenceIsAttributable(result, assessment, signals);
}
