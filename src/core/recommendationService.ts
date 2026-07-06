import type { AppConfig } from "../config.js";
import { KakaoLocalClient } from "../clients/kakaoLocalClient.js";
import { GooglePlacesClient } from "../clients/googlePlacesClient.js";
import { OsmOverpassClient } from "../clients/osmOverpassClient.js";
import { WheelMateDatabase } from "../data/db.js";
import { cacheKey } from "../utils/cache.js";
import { getCategoryMapping, normalizeCategory } from "./categoryMapper.js";
import { knownLocationFallback } from "./geocode.js";
import { isFranchise, shouldExcludeFranchise } from "./franchise.js";
import { GOOGLE_CACHE_TTL_MS, shouldUseGoogleFallback } from "./googleFallback.js";
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
  const excludeFranchise = shouldExcludeFranchise(input);
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
      excludeFranchise,
      sourceStatus: [
        ...sourceStatus,
        status("Geocode", "unavailable", "Unable to resolve location without Kakao result or fallback")
      ]
    });
  }

  const mapping = getCategoryMapping(category);
  // 카카오 2페이지(최대 30건)까지 후보 풀을 넓힌다. 최종 노출은 limit 으로 잘린다.
  const candidateLimit = Math.min(Math.max(limit * 3, 30), 45);
  let candidates = await searchKakaoCandidates(kakao, origin, category, radiusM, candidateLimit, sourceStatus);

  // 무료/커뮤니티 출처(OSM)를 먼저 병합한다. (Google 은 유료라 뒤에서 조건부로만 호출)
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

  // 사용자 추가 요구사항: 프랜차이즈 제외
  if (excludeFranchise) {
    candidates = candidates.filter((candidate) => !isFranchise(candidate.name));
  }

  // 로컬 공공데이터 DB(보조 편의시설)와 Google 응답 캐시를 위해 DB 를 연다.
  const db = new WheelMateDatabase(config.dbPath);
  const dbOk = db.init();
  sourceStatus.push(
    dbOk ? status("Local public-data SQLite", "ok") : status("Local public-data SQLite", "unavailable")
  );
  const supportFacilities = db.querySupportFacilities(origin, radiusM, "all", 50);

  // 1차로 로컬(Kakao/OSM/공공데이터) 근거만으로 랭킹한다.
  const localScored = rankPlaces(candidates, origin, supportFacilities, radiusM);

  // Google Places(New) accessibilityOptions 는 유료 SKU 이므로 fallback 으로만 아껴서 호출한다.
  // 로컬 상위 후보에 이미 매장·건물 단위(A/B) 근거가 있으면 호출을 건너뛴다.
  const localTopGrades = localScored.slice(0, Math.max(limit, 1)).map((item) => item.grade);
  const useGoogle = google.enabled && shouldUseGoogleFallback(localTopGrades, config.googleFallbackOnly);

  if (useGoogle) {
    try {
      const key = cacheKey("google-nearby", {
        lat: Math.round(origin.lat * 1000) / 1000,
        lng: Math.round(origin.lng * 1000) / 1000,
        types: mapping.googleIncludedTypes,
        radius: radiusM
      });
      const cached = db.getCachedJson<PlaceCandidate[]>(key);
      const googleCandidates =
        cached ?? (await google.searchNearby(origin, mapping.googleIncludedTypes, radiusM, candidateLimit));
      if (!cached) {
        db.putCachedJson(key, "Google Places", googleCandidates, GOOGLE_CACHE_TTL_MS);
      }
      candidates = mergeCandidates(candidates, googleCandidates);
      if (excludeFranchise) {
        candidates = candidates.filter((candidate) => !isFranchise(candidate.name));
      }
      sourceStatus.push(
        status(
          "Google Places",
          "ok",
          cached
            ? "캐시 재사용 (유료 API 미호출)"
            : config.googleFallbackOnly
              ? "로컬 근거 부족으로 fallback 호출"
              : "always 모드 호출"
        )
      );
    } catch (error) {
      sourceStatus.push(
        status("Google Places", "unavailable", error instanceof Error ? error.message : String(error))
      );
    }
  } else if (google.enabled) {
    sourceStatus.push(
      status("Google Places", "skipped", "로컬 근거로 충분하여 유료 API 를 호출하지 않음")
    );
  } else {
    sourceStatus.push(
      status(
        "Google Places",
        "disabled",
        config.useGooglePlaces ? "GOOGLE_MAPS_API_KEY is not configured" : "USE_GOOGLE_PLACES=false"
      )
    );
  }

  db.close();

  // Google 을 호출했을 때만 후보 집합이 바뀌므로 재랭킹하고, 아니면 1차 랭킹을 재사용한다.
  const scored = useGoogle ? rankPlaces(candidates, origin, supportFacilities, radiusM) : localScored;

  return buildRecommendationResponse({
    inputLocation: input.location,
    category,
    radiusM,
    origin,
    scoredPlaces: scored,
    limit,
    fallbackUsed,
    excludeFranchise,
    sourceStatus
  });
};
