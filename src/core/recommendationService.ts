import type { AppConfig } from "../config.js";
import { KakaoLocalClient } from "../clients/kakaoLocalClient.js";
import { GooglePlacesClient } from "../clients/googlePlacesClient.js";
import { OsmOverpassClient } from "../clients/osmOverpassClient.js";
import { WheelMateDatabase } from "../data/db.js";
import { getCategoryMapping, normalizeCategory } from "./categoryMapper.js";
import { knownLocationFallback } from "./geocode.js";
import { matchPlaces } from "./placeMatcher.js";
import { rankPlaces } from "./ranking.js";
import { buildRecommendationResponse } from "./responseBuilder.js";
import type {
  AccessibilityEvidence,
  Category,
  GeoPoint,
  PlaceCandidate,
  RecommendationResponse,
  RecommendAccessiblePlacesInput,
  SourceStatus
} from "./types.js";

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);

const status = (source: string, value: SourceStatus["status"], reason?: string): SourceStatus => ({
  source,
  status: value,
  ...(reason ? { reason } : {})
});

const conservativeEvidenceForMatch = (
  evidence: AccessibilityEvidence[],
  strength: "strong" | "weak"
): AccessibilityEvidence[] =>
  evidence.map((item) => ({
    ...item,
    level: strength === "strong" ? item.level : "unverified",
    matchStrength: strength,
    detail:
      strength === "strong"
        ? item.detail
        : `약한 장소 매칭으로 참고 정보 처리: ${item.detail}`
  }));

const mergeCandidates = (base: PlaceCandidate[], incoming: PlaceCandidate[]): PlaceCandidate[] => {
  const merged = [...base];

  for (const candidate of incoming) {
    let bestIndex = -1;
    let bestScore = 0;
    let bestStrength: "strong" | "weak" | "none" = "none";

    for (const [index, existing] of merged.entries()) {
      const match = matchPlaces(existing, candidate);
      if (match.score > bestScore) {
        bestIndex = index;
        bestScore = match.score;
        bestStrength = match.strength;
      }
    }

    if (bestIndex >= 0 && bestStrength !== "none") {
      const existing = merged[bestIndex]!;
      merged[bestIndex] = {
        ...existing,
        googleMapsUri: existing.googleMapsUri ?? candidate.googleMapsUri,
        evidence: [
          ...existing.evidence,
          ...conservativeEvidenceForMatch(candidate.evidence, bestStrength)
        ],
        raw: existing.raw
      };
    } else {
      merged.push(candidate);
    }
  }

  return merged;
};

const resolveOrigin = async (
  kakao: KakaoLocalClient,
  location: string,
  sourceStatus: SourceStatus[]
): Promise<{ origin?: GeoPoint; fallbackUsed: boolean }> => {
  if (kakao.enabled) {
    try {
      const origin = await kakao.resolveLocation(location);
      sourceStatus.push(status("Kakao Local", "ok"));
      if (origin) {
        return { origin, fallbackUsed: false };
      }
    } catch (error) {
      sourceStatus.push(
        status("Kakao Local", "unavailable", error instanceof Error ? error.message : String(error))
      );
    }
  } else {
    sourceStatus.push(status("Kakao Local", "disabled", "KAKAO_REST_API_KEY is not configured"));
  }

  const fallback = knownLocationFallback(location);
  return fallback ? { origin: fallback, fallbackUsed: true } : { fallbackUsed: false };
};

const searchKakaoCandidates = async (
  kakao: KakaoLocalClient,
  origin: GeoPoint,
  category: Category,
  radiusM: number,
  limit: number,
  sourceStatus: SourceStatus[]
): Promise<PlaceCandidate[]> => {
  if (!kakao.enabled) {
    return [];
  }
  const mapping = getCategoryMapping(category);
  try {
    if (mapping.kakaoCategoryGroupCode) {
      return await kakao.categorySearch(
        mapping.kakaoCategoryGroupCode,
        origin.lng,
        origin.lat,
        radiusM,
        limit
      );
    }
    return await kakao.keywordSearch(mapping.koreanLabel, origin.lng, origin.lat, radiusM, limit);
  } catch (error) {
    sourceStatus.push(
      status("Kakao Local place search", "unavailable", error instanceof Error ? error.message : String(error))
    );
    return [];
  }
};

export const recommendAccessiblePlaces = async (
  input: RecommendAccessiblePlacesInput,
  config: AppConfig
): Promise<RecommendationResponse> => {
  const category = normalizeCategory(input.category);
  const radiusM = clamp(input.radius_m ?? config.defaultRadiusM, 100, 3000);
  const limit = clamp(input.limit ?? config.defaultLimit, 1, 10);
  const sourceStatus: SourceStatus[] = [];
  const kakao = new KakaoLocalClient(config);
  const google = new GooglePlacesClient(config);
  const osm = new OsmOverpassClient(config);

  const { origin, fallbackUsed } = await resolveOrigin(kakao, input.location, sourceStatus);
  if (!origin) {
    return buildRecommendationResponse({
      inputLocation: input.location,
      category,
      radiusM,
      origin: { name: input.location, lat: 0, lng: 0, provider: "unresolved" },
      scoredPlaces: [],
      limit,
      fallbackUsed,
      sourceStatus: [
        ...sourceStatus,
        status("Geocode", "unavailable", "Unable to resolve location without Kakao result or fallback")
      ]
    });
  }

  const mapping = getCategoryMapping(category);
  const candidateLimit = Math.min(Math.max(limit * 3, limit), 15);
  let candidates = await searchKakaoCandidates(kakao, origin, category, radiusM, candidateLimit, sourceStatus);

  if (google.enabled) {
    try {
      const googleCandidates = await google.searchNearby(
        origin,
        mapping.googleIncludedTypes,
        radiusM,
        candidateLimit
      );
      candidates = mergeCandidates(candidates, googleCandidates);
      sourceStatus.push(status("Google Places", "ok"));
    } catch (error) {
      sourceStatus.push(
        status("Google Places", "unavailable", error instanceof Error ? error.message : String(error))
      );
    }
  } else {
    sourceStatus.push(
      status(
        "Google Places",
        "disabled",
        config.useGooglePlaces ? "GOOGLE_MAPS_API_KEY is not configured" : "USE_GOOGLE_PLACES=false"
      )
    );
  }

  if (osm.enabled) {
    try {
      const osmCandidates = await osm.searchNearby(origin, mapping.osmAmenities, radiusM);
      candidates = mergeCandidates(candidates, osmCandidates);
      sourceStatus.push(status("OSM", "ok"));
    } catch (error) {
      sourceStatus.push(status("OSM", "unavailable", error instanceof Error ? error.message : String(error)));
    }
  } else {
    sourceStatus.push(status("OSM", "disabled", "USE_OSM=false"));
  }

  const db = new WheelMateDatabase(config.dbPath);
  const dbOk = db.init();
  sourceStatus.push(
    dbOk ? status("Local public-data SQLite", "ok") : status("Local public-data SQLite", "unavailable")
  );
  const supportFacilities = db.querySupportFacilities(origin, radiusM, "all", 50);
  db.close();

  const scored = rankPlaces(candidates, origin, supportFacilities, radiusM);

  return buildRecommendationResponse({
    inputLocation: input.location,
    category,
    radiusM,
    origin,
    scoredPlaces: scored,
    limit,
    fallbackUsed,
    sourceStatus
  });
};
