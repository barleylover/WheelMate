import type {
  Origin,
  QueryInterpretation,
  RankedPlace,
  ReviewEvidence,
  SearchSource,
  SupportFacility
} from "../types.js";
import { categoryKeyword } from "../core/categoryMapper.js";

function kakaoMapLink(name: string, lat: number, lng: number): string {
  return `https://map.kakao.com/link/map/${encodeURIComponent(name)},${lat},${lng}`;
}

function kakaoRouteLink(name: string, lat: number, lng: number): string {
  return `https://map.kakao.com/link/to/${encodeURIComponent(name)},${lat},${lng}`;
}

function signalMessage(evidence: ReviewEvidence[]): string[] {
  return evidence.flatMap((item) =>
    item.signals
      .filter((signal) => signal.polarity === "positive")
      .map((signal) => `${sourceLabel(item.source)} 검색 결과에서 '${signal.matched_text}' 표현 언급`)
  );
}

function negativeMessage(evidence: ReviewEvidence[]): string[] {
  return evidence.flatMap((item) =>
    item.signals
      .filter((signal) => signal.polarity !== "positive")
      .map((signal) => `${sourceLabel(item.source)} 검색 결과에서 '${signal.matched_text}' 언급`)
  );
}

function sourceLabel(source: SearchSource): string {
  if (source === "naver_blog") return "네이버 블로그";
  if (source === "naver_cafe") return "네이버 카페글";
  if (source === "naver_web") return "네이버 웹문서";
  if (source === "daum_blog") return "다음 블로그";
  if (source === "daum_cafe") return "다음 카페글";
  return "다음 웹문서";
}

function serializeEvidence(evidence: ReviewEvidence[]): Array<Record<string, unknown>> {
  return evidence.map((item) => ({
    source: item.source,
    title: item.title,
    link: item.link,
    snippet: item.snippet,
    date: item.date,
    place_match_score: item.place_match_score,
    signals: item.signals
  }));
}

function serializeSupportFacilities(facilities: SupportFacility[]): Array<Record<string, unknown>> {
  return facilities.map((facility) => ({
    type: facility.type,
    name: facility.name,
    address: facility.address,
    distance_m: facility.distance_m,
    opening_hours: facility.opening_hours,
    source: facility.source
  }));
}

const UNKNOWN_OR_UNVERIFIED = [
  "실제 문턱 높이",
  "실내 좌석 간격",
  "당일 혼잡도",
  "매장 구조 변경 여부",
  "검색 결과가 최신 상태인지 여부"
];

const DEFAULT_CAUTIONS = [
  "검색 결과 요약문 기반 참고 신호이며 공식 접근성 정보가 아닙니다.",
  "방문 전 전화 확인을 권장합니다."
];

function recommendationToJson(item: RankedPlace, rank: number): Record<string, unknown> {
  const place = item.place;
  return {
    rank,
    name: place.name,
    category: place.category,
    address: place.roadAddress ?? place.address,
    distance_m: place.distance_m,
    review_signal_grade: item.review.review_signal_grade,
    official_support_grade: item.official_support_grade,
    recommendation_status: item.recommendation_status,
    review_signal_score: item.review.review_signal_score,
    ranking_score: Math.round(item.ranking_score),
    confirmed_review_signals: signalMessage(item.review.results),
    negative_or_caution_signals: negativeMessage(item.review.results),
    public_support_evidence: item.public_support_evidence.map((evidence) => ({
      source: evidence.source,
      level: evidence.level,
      detail: evidence.detail,
      distance_m: evidence.distance_m
    })),
    support_facilities_nearby: serializeSupportFacilities(item.support_facilities_nearby),
    review_evidence: serializeEvidence(item.review.results),
    searched_sources: item.review.searched_sources,
    source_counts: item.review.source_counts,
    unavailable_sources: item.review.unavailable_sources,
    unknown_or_unverified: UNKNOWN_OR_UNVERIFIED,
    cautions: DEFAULT_CAUTIONS,
    links: {
      kakao_map: kakaoMapLink(place.name, place.lat, place.lng),
      kakao_route: kakaoRouteLink(place.name, place.lat, place.lng)
    },
    attribution: item.review.attribution
  };
}

function cautionToJson(item: RankedPlace): Record<string, unknown> {
  return {
    name: item.place.name,
    reason:
      item.review.negative_signals.length > 0
        ? "검색 결과에서 강한 부정 또는 주의 신호가 확인되어 피하는 것이 좋은 후보로 분류했습니다."
        : "출처 간 정보가 충돌해 추천에서 제외했습니다.",
    review_evidence: serializeEvidence(item.review.results)
  };
}

function buildMessage(
  interpretation: QueryInterpretation,
  recommendations: RankedPlace[],
  notRecommended: RankedPlace[],
  fallbackUsed: boolean
): string {
  const lines: string[] = [];
  const categoryLabel = categoryKeyword(interpretation.category) || "장소";
  lines.push(
    `${interpretation.location} 근처 ${categoryLabel} 후보 중에서 블로그·카페·웹문서 검색 결과에 휠체어 접근성 관련 언급이 있는 장소를 보수적으로 정리했습니다.`
  );
  lines.push("");
  lines.push("후기 기반 접근성 신호");
  if (recommendations.length === 0) {
    lines.push("- 추천에 넣을 만큼 명확한 후기 기반 긍정 신호가 있는 후보는 아직 확인되지 않았습니다.");
  } else {
    for (const [index, item] of recommendations.entries()) {
      const signals = signalMessage(item.review.results).slice(0, 3).join(", ") || "명확한 긍정 표현 없음";
      lines.push(
        `- ${index + 1}순위. ${item.place.name}: ${item.review.review_signal_grade}, 검색 결과에서 ${signals}`
      );
    }
  }
  lines.push("");
  lines.push("공공데이터 기반 보조 근거");
  if (recommendations.some((item) => item.public_support_evidence.length > 0)) {
    for (const item of recommendations) {
      for (const evidence of item.public_support_evidence.slice(0, 2)) {
        lines.push(`- ${item.place.name}: ${evidence.detail}`);
      }
    }
  } else {
    lines.push("- 현재 로컬 공공데이터 DB에서 매칭된 보조 근거는 없습니다.");
  }
  lines.push("");
  lines.push("확인되지 않은 정보");
  lines.push(`- ${UNKNOWN_OR_UNVERIFIED.join(", ")}`);
  if (interpretation.unsupported_preferences.includes("조용한")) {
    lines.push("- 조용한 정도는 검색 결과만으로 신뢰성 있게 판단하지 않았습니다.");
  }
  if (notRecommended.length > 0) {
    lines.push("");
    lines.push(`주의 후보 ${notRecommended.length}곳은 추천에서 제외했습니다.`);
  }
  if (fallbackUsed) {
    lines.push(
      "요청하신 카페/음식점 중 후기 기반 접근성 신호가 충분한 후보가 부족해, 접근성 정보가 있는 대체 장소도 함께 안내합니다."
    );
  }
  lines.push("주의: 이 결과는 검색 결과의 제목과 요약문을 기반으로 한 참고 신호이며 공식 접근성 정보가 아닙니다. 방문 전 전화 확인을 권장합니다.");
  return lines.join("\n");
}

export function buildRecommendResponse(input: {
  interpretation: QueryInterpretation;
  origin: Origin;
  recommendations: RankedPlace[];
  notRecommended: RankedPlace[];
  unverified: RankedPlace[];
  fallbackUsed: boolean;
  fallbackReason: string | null;
  fallbackRecommendations: RankedPlace[];
}): Record<string, unknown> {
  return {
    query_interpretation: input.interpretation,
    origin: input.origin,
    ranking_policy: {
      primary_sort: "review_signal_grade_priority",
      secondary_sort: "review_signal_score_desc",
      tertiary_sort: "distance_asc",
      grade_priority: ["R1", "R2", "O1", "R3", "C", "R4"],
      note: "후기 검색 기반 접근성 신호를 우선하고, 공식/공공 보조 근거는 별도 근거로 표시합니다."
    },
    recommendations: input.recommendations.map((item, index) => recommendationToJson(item, index + 1)),
    not_recommended_places: input.notRecommended.map(cautionToJson),
    unverified_candidates: input.unverified.map((item) => recommendationToJson(item, 0)),
    fallback_used: input.fallbackUsed,
    fallback_reason: input.fallbackReason,
    fallback_recommendations: input.fallbackRecommendations.map((item, index) =>
      recommendationToJson(item, index + 1)
    ),
    message_for_user: buildMessage(
      input.interpretation,
      input.recommendations,
      input.notRecommended,
      input.fallbackUsed
    )
  };
}
