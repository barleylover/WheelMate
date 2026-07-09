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

function kakaoRoadviewLink(place: { sourcePlaceId?: string; lat: number; lng: number }): string {
  if (place.sourcePlaceId) {
    return `https://map.kakao.com/link/roadview/${place.sourcePlaceId}`;
  }
  return `https://map.kakao.com/link/roadview/${place.lat},${place.lng}`;
}

function signalMessage(evidence: ReviewEvidence[]): string[] {
  return uniqueMessages(evidence.flatMap((item) =>
    item.signals
      .filter((signal) => signal.polarity === "positive")
      .map((signal) => `${sourceLabel(item.source)} 검색 결과에서 '${signal.matched_text}' 표현 언급`)
  ));
}

function negativeMessage(evidence: ReviewEvidence[]): string[] {
  return uniqueMessages(evidence.flatMap((item) =>
    item.signals
      .filter((signal) => signal.polarity !== "positive")
      .map((signal) => `${sourceLabel(item.source)} 검색 결과에서 '${signal.matched_text}' 언급`)
  ));
}

function uniqueMessages(messages: string[]): string[] {
  return [...new Set(messages)];
}

function sourceLabel(source: SearchSource): string {
  if (source === "naver_blog") return "네이버 블로그";
  if (source === "naver_cafe") return "네이버 카페글";
  if (source === "naver_web") return "네이버 웹문서";
  if (source === "daum_blog") return "다음 블로그";
  if (source === "daum_cafe") return "다음 카페글";
  return "다음 웹문서";
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1).trim()}…`;
}

function displayAddress(place: { roadAddress?: string; address?: string }): string | undefined {
  return place.roadAddress || place.address || undefined;
}

function serializeEvidence(evidence: ReviewEvidence[], limit = 3): Array<Record<string, unknown>> {
  return evidence.slice(0, limit).map((item) => ({
    source: item.source,
    title: truncate(item.title, 90),
    link: item.link,
    snippet: truncate(item.snippet, 140),
    date: item.date,
    place_match_score: item.place_match_score,
    signals: item.signals.slice(0, 4).map((signal) => ({
      polarity: signal.polarity,
      type: signal.type,
      matched_text: signal.matched_text
    }))
  }));
}

function serializeSupportFacilities(facilities: SupportFacility[], limit = 3): Array<Record<string, unknown>> {
  return facilities.slice(0, limit).map((facility) => ({
    type: facility.type,
    name: facility.name,
    address: facility.address,
    distance_m: facility.distance_m
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

const ALL_SEARCH_SOURCES: SearchSource[] = [
  "naver_blog",
  "naver_cafe",
  "naver_web",
  "daum_blog",
  "daum_cafe",
  "daum_web"
];

interface SearchDiagnostics {
  analyzed_candidate_count: number;
  review_positive_candidate_count: number;
  review_evidence_count: number;
  searched_sources: SearchSource[];
  source_counts: Record<SearchSource, number>;
  unavailable_sources: Partial<Record<SearchSource, string>>;
  likely_issue: string | null;
}

interface CandidateDiagnostics {
  fallback_reason: string | null;
  likely_issue: string | null;
}

function emptySourceCounts(): Record<SearchSource, number> {
  return {
    naver_blog: 0,
    naver_cafe: 0,
    naver_web: 0,
    daum_blog: 0,
    daum_cafe: 0,
    daum_web: 0
  };
}

function buildSearchDiagnostics(items: RankedPlace[]): SearchDiagnostics {
  const sourceCounts = emptySourceCounts();
  const searchedSources = new Set<SearchSource>();
  const unavailableSources: Partial<Record<SearchSource, string>> = {};
  let reviewEvidenceCount = 0;
  let reviewPositiveCandidateCount = 0;
  for (const item of items) {
    if (item.review.review_signal_grade === "R1" || item.review.review_signal_grade === "R2") {
      reviewPositiveCandidateCount += 1;
    }
    reviewEvidenceCount += item.review.results.length;
    for (const source of item.review.searched_sources) searchedSources.add(source);
    for (const source of ALL_SEARCH_SOURCES) {
      sourceCounts[source] += item.review.source_counts[source] ?? 0;
    }
    for (const [source, reason] of Object.entries(item.review.unavailable_sources) as Array<[SearchSource, string]>) {
      unavailableSources[source] = reason;
    }
  }
  const totalSearchResults = Object.values(sourceCounts).reduce((sum, count) => sum + count, 0);
  const unavailableReasons = Object.values(unavailableSources);
  let likelyIssue: string | null = null;
  if (items.length > 0 && totalSearchResults === 0 && unavailableReasons.length > 0) {
    if (unavailableReasons.some((reason) => reason.includes("credentials_missing"))) {
      likelyIssue = "search_api_credentials_missing_or_not_passed";
    } else {
      likelyIssue = "search_api_calls_unavailable";
    }
  }
  return {
    analyzed_candidate_count: items.length,
    review_positive_candidate_count: reviewPositiveCandidateCount,
    review_evidence_count: reviewEvidenceCount,
    searched_sources: [...searchedSources],
    source_counts: sourceCounts,
    unavailable_sources: unavailableSources,
    likely_issue: likelyIssue
  };
}

function buildCandidateDiagnostics(fallbackReason: string | null): CandidateDiagnostics {
  let likelyIssue: string | null = null;
  if (fallbackReason === "kakao_local_credentials_missing") {
    likelyIssue = "kakao_local_api_key_missing_or_not_passed";
  } else if (fallbackReason === "location_unresolved") {
    likelyIssue = "location_could_not_be_resolved";
  } else if (fallbackReason === "content_preference_filtered_all_candidates") {
    likelyIssue = "content_filter_removed_all_candidates";
  }
  return {
    fallback_reason: fallbackReason,
    likely_issue: likelyIssue
  };
}

function zeroRecommendationMessage(
  fallbackReason: string | null,
  diagnostics: SearchDiagnostics
): string {
  if (fallbackReason === "kakao_local_credentials_missing") {
    return "Kakao Local API 키가 서버 환경변수/시크릿으로 전달되지 않아 위치 좌표와 후보 장소를 찾지 못했습니다. 카카오클라우드 MCP 서버의 KAKAO_REST_API_KEY 설정을 확인해 주세요.";
  }
  if (fallbackReason === "location_unresolved") {
    return "요청 위치의 좌표를 찾지 못해 주변 후보 장소를 만들지 못했습니다. 위치명을 더 구체적으로 입력하거나 Kakao Local API 상태를 확인해 주세요.";
  }
  if (fallbackReason === "content_preference_filtered_all_candidates") {
    return "요청한 세부 장소/음식 조건에 맞는 주변 후보가 없어 추천을 만들지 못했습니다. 같은 위치에서 더 넓은 장소 종류로 다시 시도해 주세요.";
  }
  if (diagnostics.likely_issue === "search_api_credentials_missing_or_not_passed") {
    return "검색 API 인증이 배포 서버까지 전달되지 않아 후기 근거를 가져오지 못했습니다. 카카오클라우드 MCP 서버의 NAVER_CLIENT_ID, NAVER_CLIENT_SECRET, KAKAO_REST_API_KEY 설정을 확인해 주세요.";
  }
  if (diagnostics.likely_issue === "search_api_calls_unavailable") {
    return "검색 API 호출이 실패해 후기 근거를 가져오지 못했습니다. 잠시 후 다시 시도하거나 런타임 상태의 unavailable_sources를 확인해 주세요.";
  }
  return "추천에 넣을 만큼 명확한 후기 기반 긍정 신호가 있는 후보는 아직 확인되지 않았습니다.";
}

function recommendationToJson(item: RankedPlace, rank: number): Record<string, unknown> {
  const place = item.place;
  const evidence = bestPositiveEvidence(item.review.results);
  const mapLink = kakaoMapLink(place.name, place.lat, place.lng);
  const routeLink = kakaoRouteLink(place.name, place.lat, place.lng);
  const roadviewLink = kakaoRoadviewLink(place);
  return {
    rank,
    name: place.name,
    category: place.category,
    address: displayAddress(place),
    distance_m: place.distance_m,
    distance_text: formatDistance(place.distance_m),
    phone: formatPhone(place.phone),
    recommendation_reason: recommendationReason(item),
    source: recommendationSource(item, evidence),
    source_line: recommendationSourceLine(item, evidence),
    map_link: mapLink,
    roadview_link: roadviewLink,
    support_facilities_display: supportFacilityDisplay(item.support_facilities_nearby),
    display_markdown: recommendationDisplayBlock(item, rank),
    review_signal_grade: item.review.review_signal_grade,
    official_support_grade: item.official_support_grade,
    recommendation_status: item.recommendation_status,
    review_signal_score: item.review.review_signal_score,
    ranking_score: Math.round(item.ranking_score),
    confirmed_review_signals: signalMessage(item.review.results).slice(0, 6),
    negative_or_caution_signals: negativeMessage(item.review.results).slice(0, 4),
    public_support_evidence: item.public_support_evidence.slice(0, 4).map((evidence) => ({
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
      kakao_map: mapLink,
      kakao_route: routeLink,
      kakao_roadview: roadviewLink
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
    review_evidence: serializeEvidence(item.review.results, 2)
  };
}

function unverifiedToJson(item: RankedPlace): Record<string, unknown> {
  const place = item.place;
  return {
    name: place.name,
    category: place.category,
    address: displayAddress(place),
    distance_m: place.distance_m,
    review_signal_grade: item.review.review_signal_grade,
    official_support_grade: item.official_support_grade,
    recommendation_status: item.recommendation_status,
    confirmed_review_signals: signalMessage(item.review.results).slice(0, 2),
    negative_or_caution_signals: negativeMessage(item.review.results).slice(0, 2),
    links: {
      kakao_map: kakaoMapLink(place.name, place.lat, place.lng),
      kakao_roadview: kakaoRoadviewLink(place)
    }
  };
}

function formatDistance(distanceM: number | undefined): string {
  if (distanceM === undefined || !Number.isFinite(distanceM)) return "거리 정보 없음";
  const rounded = Math.max(0, Math.round(distanceM));
  if (rounded >= 1000) {
    const km = Math.round((rounded / 1000) * 10) / 10;
    return `약 ${km}km`;
  }
  return `약 ${rounded}m`;
}

function formatPhone(phone: string | undefined): string {
  const normalized = phone?.trim();
  if (!normalized) return "전화번호 정보 없음";
  const digits = normalized.replace(/\D/g, "");
  if (digits.length < 7) return "전화번호 정보 없음";
  return normalized;
}

function bestPositiveEvidence(evidence: ReviewEvidence[]): ReviewEvidence | undefined {
  return evidence.find((item) => item.signals.some((signal) => signal.polarity === "positive"));
}

function displayMatchedText(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/이용가능/g, "이용 가능")
    .replace(/진입가능/g, "진입 가능")
    .replace(/출입가능/g, "출입 가능")
    .replace(/접근가능/g, "접근 가능")
    .trim();
}

function recommendationReason(item: RankedPlace): string {
  const positive = bestPositiveEvidence(item.review.results);
  const matchedTexts = uniqueMessages(
    positive?.signals
      .filter((signal) => signal.polarity === "positive")
      .map((signal) => displayMatchedText(signal.matched_text)) ?? []
  );
  if (matchedTexts.length > 0) {
    return `${matchedTexts.slice(0, 2).join(", ")} 언급`;
  }
  return "검색 API에서 휠체어 접근성 근거 확인 필요";
}

function recommendationSource(item: RankedPlace, evidence: ReviewEvidence | undefined): Record<string, unknown> {
  if (!evidence) {
    return {
      label: "검색 API 접근성 근거 없음",
      detail: null,
      link: null
    };
  }
  return {
    label: sourceLabel(evidence.source),
    detail: truncate(evidence.title.replace(/<[^>]*>/g, ""), 80),
    link: evidence.link
  };
}

function recommendationSourceLine(item: RankedPlace, evidence: ReviewEvidence | undefined): string {
  const source = recommendationSource(item, evidence);
  const label = String(source.label);
  if (typeof source.link === "string" && source.link) return `출처: ${label} - [출처 보기](${source.link})`;
  if (typeof source.detail === "string" && source.detail) return `출처: ${label} - ${source.detail}`;
  return `출처: ${label}`;
}

function supportFacilityLabel(type: SupportFacility["type"]): string {
  if (type === "accessible_restroom") return "장애인 화장실";
  return "전동휠체어 충전기";
}

function supportFacilityLine(facility: SupportFacility): string {
  const address = facility.address ?? "주소 정보 없음";
  return `- 주변 ${supportFacilityLabel(facility.type)} 존재. 이름: ${facility.name}, 주소: ${address}, 거리: ${formatDistance(facility.distance_m)}`;
}

function supportFacilityDisplay(facilities: SupportFacility[]): string[] {
  return supportFacilitySection(facilities).map((line) => line.replace(/^- /, ""));
}

function supportFacilitySection(facilities: SupportFacility[]): string[] {
  const restroom = facilities.find((facility) => facility.type === "accessible_restroom");
  const charger = facilities.find((facility) => facility.type === "wheelchair_charger");
  return [
    restroom ? supportFacilityLine(restroom) : "- 주변 장애인 화장실 없음",
    charger ? supportFacilityLine(charger) : "- 주변 전동휠체어 충전기 없음"
  ];
}

function buildMessage(
  interpretation: QueryInterpretation,
  recommendations: RankedPlace[],
  notRecommended: RankedPlace[],
  unverified: RankedPlace[],
  fallbackReason: string | null,
  fallbackUsed: boolean
): string {
  const lines: string[] = [];
  const categoryLabel = categoryKeyword(interpretation.category) || "장소";
  const diagnostics = buildSearchDiagnostics([...recommendations, ...notRecommended, ...unverified]);
  if (recommendations.length === 0) {
    lines.push(
      `${interpretation.location} 근처 ${categoryLabel} 후보 중에서 블로그·카페·웹문서 검색 결과에 휠체어 접근성 관련 언급이 있는 장소를 보수적으로 정리했습니다.`
    );
    lines.push("");
    lines.push(zeroRecommendationMessage(fallbackReason, diagnostics));
  } else {
    for (const [index, item] of recommendations.entries()) {
      const place = item.place;
      const evidence = bestPositiveEvidence(item.review.results);
      const cautions = negativeMessage(item.review.results).slice(0, 2).join(", ");
      lines.push(`${index + 1}순위. ${place.name}`);
      lines.push(`추천 이유: ${recommendationReason(item)}`);
      lines.push(recommendationSourceLine(item, evidence));
      lines.push(`주소: ${displayAddress(place) ?? "주소 정보 없음"}`);
      lines.push(`거리: ${formatDistance(place.distance_m)}`);
      lines.push(`전화: ${formatPhone(place.phone)}`);
      lines.push(
        `지도: [카카오맵](${kakaoMapLink(place.name, place.lat, place.lng)}) [거리뷰](${kakaoRoadviewLink(place)})`
      );
      if (cautions) {
        lines.push(`주의 신호: ${cautions}`);
      }
      lines.push("");
      lines.push("주변 지원정보:");
      lines.push(...supportFacilitySection(item.support_facilities_nearby));
      lines.push("");
    }
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

function recommendationDisplayBlock(item: RankedPlace, rank: number): string {
  const place = item.place;
  const evidence = bestPositiveEvidence(item.review.results);
  const lines = [
    `${rank}순위. ${place.name}`,
    `추천 이유: ${recommendationReason(item)}`,
    recommendationSourceLine(item, evidence),
    `주소: ${displayAddress(place) ?? "주소 정보 없음"}`,
    `거리: ${formatDistance(place.distance_m)}`,
    `전화: ${formatPhone(place.phone)}`,
    `지도: [카카오맵](${kakaoMapLink(place.name, place.lat, place.lng)}) [거리뷰](${kakaoRoadviewLink(place)})`,
    "",
    "주변 지원정보:",
    ...supportFacilitySection(item.support_facilities_nearby)
  ];
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
  const searchDiagnostics = buildSearchDiagnostics([
    ...input.recommendations,
    ...input.notRecommended,
    ...input.unverified
  ]);
  const candidateDiagnostics = buildCandidateDiagnostics(input.fallbackReason);
  const messageForUser = buildMessage(
    input.interpretation,
    input.recommendations,
    input.notRecommended,
    input.unverified,
    input.fallbackReason,
    input.fallbackUsed
  );
  return {
    answer_markdown: messageForUser,
    answer_usage_note:
      "사용자에게 답할 때는 answer_markdown을 우선 그대로 사용하세요. recommendations를 재요약하더라도 source/link/kakao_roadview 필드는 반드시 포함해야 합니다.",
    query_interpretation: input.interpretation,
    origin: input.origin,
    ranking_policy: {
      primary_sort: "review_signal_grade_priority",
      secondary_sort: "review_signal_score_desc",
      tertiary_sort: "distance_asc",
      grade_priority: ["R1", "R2"],
      note: "정상 추천은 검색 API에서 휠체어 접근성 관련 긍정 신호가 확인된 후보만 포함하고, 장애인 화장실/전동휠체어 충전기 정보는 주변 지원정보로만 표시합니다."
    },
    recommendations: input.recommendations.map((item, index) => recommendationToJson(item, index + 1)),
    not_recommended_places: input.notRecommended.map(cautionToJson),
    unverified_candidates: input.unverified.slice(0, 3).map(unverifiedToJson),
    unverified_omitted_count: Math.max(0, input.unverified.length - 3),
    fallback_used: input.fallbackUsed,
    fallback_reason: input.fallbackReason,
    candidate_diagnostics: candidateDiagnostics,
    search_diagnostics: searchDiagnostics,
    fallback_recommendations: input.fallbackRecommendations.map((item, index) =>
      recommendationToJson(item, index + 1)
    ),
    message_for_user: messageForUser
  };
}
