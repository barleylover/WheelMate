import { getCategoryMapping } from "./categoryMapper.js";
import { confirmedAccessibilityLabels, recommendationReason, unknownAccessibilityItems } from "./evidence.js";
import { kakaoMapLink, kakaoRouteLink } from "./links.js";
import type {
  Category,
  GeoPoint,
  RecommendationResponse,
  ScoredPlace,
  SourceStatus
} from "./types.js";

const evidenceDetailRows = (scored: ScoredPlace): RecommendationResponse["recommendations"][number]["evidence"] =>
  scored.place.evidence
    .filter((item) => item.evidenceType !== "provider_unavailable")
    .map((item) => ({
      source: item.source,
      level: item.level,
      detail: item.detail
    }));

const attributionRows = (scored: ScoredPlace): string[] => {
  const rows = new Set<string>();
  if (scored.place.evidence.some((item) => item.source === "Google Places")) {
    rows.add("Google Places 접근성 정보 사용");
  }
  if (scored.place.source === "OSM" || scored.place.evidence.some((item) => item.source === "OSM")) {
    rows.add("OpenStreetMap contributors");
  }
  // 공공데이터(장애인편의시설/BF 인증 등) 건물 단위 근거 출처를 그대로 표기한다.
  for (const item of scored.place.evidence) {
    if (
      item.evidenceType === "bf_certified" ||
      item.evidenceType === "disability_facility" ||
      item.evidenceType === "entrance_ramp" ||
      item.evidenceType === "threshold_removed" ||
      item.evidenceType === "elevator" ||
      item.evidenceType === "building_accessible_restroom"
    ) {
      rows.add(`${item.source} (공공데이터)`);
    }
  }
  return [...rows];
};

const cautionsFor = (scored: ScoredPlace): string[] => {
  const cautions = [
    "공공/지도 데이터 기준으로 확인된 정보이며, 방문 전 전화 확인을 권장합니다."
  ];
  if (scored.place.evidence.some((item) => item.evidenceType === "bf_certified")) {
    cautions.push("BF 인증은 건물/시설 단위 근거이며, 개별 매장 내부 구조를 보장하지 않습니다.");
  }
  if (scored.place.evidence.some((item) => item.evidenceType === "osm_wheelchair")) {
    cautions.push("OSM 정보는 커뮤니티 기반 데이터이므로 최신 현장 상태와 다를 수 있습니다.");
  }
  return cautions;
};

const emptyMessage = (
  location: string,
  category: Category,
  sourceStatus: SourceStatus[],
  fallbackUsed: boolean
): string => {
  const label = getCategoryMapping(category).koreanLabel;
  const unavailable = sourceStatus
    .filter((status) => status.status !== "ok")
    .map((status) => `${status.source}: ${status.reason ?? status.status}`);
  const fallbackNote = fallbackUsed
    ? "\n일부 위치는 내장 좌표 fallback을 사용했으므로 실제 검색 전 카카오 Local API 키 설정을 권장합니다."
    : "";
  const sourceNote =
    unavailable.length > 0 ? `\n사용할 수 없었던 출처: ${unavailable.join(", ")}` : "";
  return `${location} 근처 ${label} 후보를 찾았지만, 접근성 근거가 확인된 추천 결과를 만들 수 없었습니다.${fallbackNote}${sourceNote}\n데이터가 없다는 이유로 접근 가능하다고 단정하지 않았습니다. 방문 전 전화 확인을 권장합니다.`;
};

export const buildRecommendationResponse = (params: {
  inputLocation: string;
  category: Category;
  radiusM: number;
  origin: GeoPoint;
  scoredPlaces: ScoredPlace[];
  limit: number;
  fallbackUsed: boolean;
  excludeFranchise: boolean;
  sourceStatus: SourceStatus[];
}): RecommendationResponse => {
  const recommendations = params.scoredPlaces.slice(0, params.limit).map((scored, index) => {
    const confirmed = confirmedAccessibilityLabels(scored.place.evidence);
    const supportNames = scored.supportFacilitiesNearby.map((facility) => facility.name);
    return {
      rank: index + 1,
      name: scored.place.name,
      category: scored.place.category,
      address: scored.place.roadAddress ?? scored.place.address,
      distance_m: scored.distanceM,
      accessibility_grade: scored.grade,
      score: scored.score,
      confirmed_accessibility:
        confirmed.length > 0 ? confirmed : ["접근성 정보가 확인되지 않음"],
      recommendation_reason: recommendationReason(scored.grade, confirmed, scored.distanceM, supportNames),
      support_facilities_nearby: scored.supportFacilitiesNearby.map((facility) => ({
        type: facility.type,
        name: facility.name,
        distance_m: facility.distanceM ?? 0
      })),
      evidence: evidenceDetailRows(scored),
      unknown_or_unverified: unknownAccessibilityItems(),
      cautions: cautionsFor(scored),
      links: {
        kakao_map: kakaoMapLink(
          scored.place.name,
          scored.place.kakaoPlaceUrl,
          scored.place.roadAddress ?? scored.place.address
        ),
        kakao_route: kakaoRouteLink(params.inputLocation, scored.place.name),
        ...(scored.place.googleMapsUri ? { google_maps: scored.place.googleMapsUri } : {})
      },
      attribution: attributionRows(scored)
    };
  });

  const label = getCategoryMapping(params.category).koreanLabel;
  const message =
    recommendations.length === 0
      ? emptyMessage(params.inputLocation, params.category, params.sourceStatus, params.fallbackUsed)
      : [
          `${params.inputLocation} 근처 ${label} 후보를 접근성 근거 기준으로 정리했어요.${
            params.excludeFranchise ? " (프랜차이즈는 제외했어요.)" : ""
          }`,
          "",
          ...recommendations.flatMap((item) => [
            `${item.rank}순위. ${item.name}`,
            `- 추천 이유: ${item.recommendation_reason}`,
            `- 거리: 약 ${item.distance_m}m`,
            `- 접근성 등급: ${item.accessibility_grade}`,
            `- 확인된 접근성 정보: ${item.confirmed_accessibility.join(", ")}`,
            `- 추가 편의정보: ${
              item.support_facilities_nearby.length > 0
                ? item.support_facilities_nearby
                    .map((facility) => `${facility.name} 약 ${facility.distance_m}m`)
                    .join(", ")
                : "주변 보조 편의시설 정보 없음"
            }`,
            `- 확인되지 않은 정보: ${item.unknown_or_unverified.join(", ")}`,
            `- 카카오맵 위치: ${item.links.kakao_map}`,
            `- 카카오맵 길찾기: ${item.links.kakao_route}`,
            ""
          ]),
          "공공/지도 데이터 기준으로 확인된 정보이며, 매장 구조나 운영 상황은 바뀔 수 있으니 방문 전 전화 확인을 권장드려요."
        ].join("\n");

  return {
    query_interpretation: {
      location: params.inputLocation,
      category: params.category,
      radius_m: params.radiusM,
      exclude_franchise: params.excludeFranchise
    },
    origin: params.origin,
    recommendations,
    fallback_used: params.fallbackUsed,
    source_status: params.sourceStatus,
    message_for_user: message
  };
};
