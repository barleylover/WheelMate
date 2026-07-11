import { config } from "../config.js";
import {
  recommendAccessiblePlacesByReviewSearch,
  type RecommendAccessiblePlacesInput
} from "../mcp/tools/recommendAccessiblePlacesByReviewSearch.js";
import { findNearbySupportFacilities } from "../mcp/tools/findNearbySupportFacilities.js";
import { searchPlaceAccessibilityReviews } from "../mcp/tools/searchPlaceAccessibilityReviews.js";

interface LiveQaCase {
  name: string;
  input: RecommendAccessiblePlacesInput;
  expectedLocation: string;
  expectedCategory: string;
  expectedContent?: string[];
  expectedPreferences?: string[];
  expectedWarnings?: string[];
  expectedOriginAddressIncludes?: string;
  minimumVerified?: number;
}

const CASES: LiveQaCase[] = [
  {
    name: "submitted-jamsil-cafe",
    input: { query: "잠실역 근처 휠체어 접근성 좋은 카페 찾아줘" },
    expectedLocation: "잠실역",
    expectedCategory: "cafe",
    expectedContent: [],
    minimumVerified: 1
  },
  {
    name: "reviewer-seoul-region",
    input: { location: "서울 전체", category: "cafe" },
    expectedLocation: "서울",
    expectedCategory: "cafe",
    expectedContent: [],
    minimumVerified: 1
  },
  {
    name: "submitted-seomyeon-restaurant",
    input: { query: "휠체어 타고 갈건데, 부산 서면역 근처 음식점 추천해줘" },
    expectedLocation: "부산 서면역",
    expectedCategory: "restaurant",
    expectedContent: [],
    minimumVerified: 1
  },
  {
    name: "submitted-jeju-sashimi",
    input: { query: "제주도 횟집 휠체어 타고 가기 편한 곳 추천해줘" },
    expectedLocation: "제주도",
    expectedCategory: "restaurant",
    expectedContent: ["횟집", "회", "생선회"],
    minimumVerified: 1
  },
  {
    name: "particle-suffix",
    input: { query: "잠실역은 휠체어로 갈 수 있는 카페가 어디야?" },
    expectedLocation: "잠실역",
    expectedCategory: "cafe",
    expectedContent: []
  },
  {
    name: "spacing-and-typo",
    input: { query: "잠실 역 근처 휠 체어 가능한 까페 알려줄래요" },
    expectedLocation: "잠실역",
    expectedCategory: "cafe",
    expectedContent: []
  },
  {
    name: "location-correction",
    input: { query: "강남 말고 홍대입구역 휠체어 카페 추천해줘" },
    expectedLocation: "홍대입구역",
    expectedCategory: "cafe",
    expectedContent: []
  },
  {
    name: "restroom-as-venue-preference",
    input: { query: "강남역 장애인 화장실 있는 카페 추천" },
    expectedLocation: "강남역",
    expectedCategory: "cafe",
    expectedContent: [],
    expectedPreferences: ["장애인화장실"]
  },
  {
    name: "charger-as-venue-preference",
    input: { query: "사당역 전동휠체어 충전기 근처 식당" },
    expectedLocation: "사당역",
    expectedCategory: "restaurant",
    expectedContent: [],
    expectedPreferences: ["충전기근처"]
  },
  {
    name: "natural-mobility-description",
    input: { query: "다리가 불편한 아버지와 강남역 식당 가려고 해" },
    expectedLocation: "강남역",
    expectedCategory: "restaurant",
    expectedContent: []
  },
  {
    name: "region-plus-local-area",
    input: { query: "제주 애월 휠체어 카페" },
    expectedLocation: "제주 애월",
    expectedCategory: "cafe",
    expectedContent: []
  },
  {
    name: "regional-food-content",
    input: { query: "부산 광안리 휠체어 횟집" },
    expectedLocation: "부산 광안리",
    expectedCategory: "restaurant",
    expectedContent: ["횟집", "회", "생선회"]
  },
  {
    name: "freeform-food-content",
    input: { query: "성수동 휠체어 베이글 카페" },
    expectedLocation: "성수동",
    expectedCategory: "cafe",
    expectedContent: ["베이글"]
  },
  {
    name: "culture-and-step-avoidance",
    input: { query: "계단을 피해야 해서 대학로 공연장 찾는 중" },
    expectedLocation: "대학로",
    expectedCategory: "culture",
    expectedContent: ["공연장"],
    expectedPreferences: ["계단회피"],
    expectedOriginAddressIncludes: "서울 종로구"
  },
  {
    name: "museum-synonym",
    input: { query: "대전 휠체어 갤러리" },
    expectedLocation: "대전",
    expectedCategory: "museum",
    expectedContent: ["갤러리"]
  },
  {
    name: "structured-input-overrides-query",
    input: {
      query: "부산 카페를 찾고 있어",
      location: "잠실역",
      category: "restaurant"
    },
    expectedLocation: "잠실역",
    expectedCategory: "restaurant",
    expectedContent: [],
    expectedWarnings: ["structured_location_overrode_query_location"]
  }
];

function records(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    : [];
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function includesAll(actual: string[], expected: string[]): boolean {
  return expected.every((item) => actual.includes(item));
}

function sameStrings(actual: string[], expected: string[]): boolean {
  return actual.length === expected.length && includesAll(actual, expected);
}

function hasSafeAttributedEvidence(recommendation: Record<string, unknown>): boolean {
  return records(recommendation.review_evidence).some((evidence) =>
    evidence.attribution_verified === true &&
    evidence.place_name_match === "exact" &&
    records(evidence.signals).some((signal) =>
      signal.polarity === "positive" &&
      (signal.subject === undefined || signal.subject === "venue")
    )
  );
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function assertLiveConfig(): void {
  const failures: string[] = [];
  if (!config.kakaoRestApiKey) failures.push("KAKAO_REST_API_KEY");
  const naverReady = config.useNaverSearch && Boolean(config.naverClientId && config.naverClientSecret);
  const daumReady = config.useDaumSearch && Boolean(config.kakaoRestApiKey);
  if (!naverReady && !daumReady) failures.push("an enabled review-search provider");
  if (failures.length > 0) {
    throw new Error(`live_qa_configuration_missing: ${failures.join(", ")}`);
  }
}

async function main(): Promise<void> {
  assertLiveConfig();
  const requestedCases = process.env.QA_CASE?.split(",").map((item) => item.trim()).filter(Boolean) ?? [];
  const cases = requestedCases.length > 0
    ? CASES.filter((item) => requestedCases.includes(item.name))
    : CASES;
  const unknownCases = requestedCases.filter((name) => !CASES.some((item) => item.name === name));
  if (unknownCases.length > 0) throw new Error(`unknown_live_qa_case: ${unknownCases.join(",")}`);
  const failures: string[] = [];
  let verifiedTotal = 0;
  let fallbackTotal = 0;
  let externalCalls = 0;
  let unavailableCalls = 0;
  let auxiliaryChecks = 0;
  const startedAt = Date.now();

  for (const qaCase of cases) {
    const caseStartedAt = Date.now();
    let result: Record<string, unknown>;
    try {
      result = await recommendAccessiblePlacesByReviewSearch(qaCase.input, config);
    } catch (error) {
      failures.push(`${qaCase.name}: threw=${error instanceof Error ? error.message : String(error)}`);
      continue;
    }

    const interpretation = result.query_interpretation as Record<string, unknown> | undefined;
    const verified = records(result.recommendations);
    const fallback = records(result.fallback_recommendations);
    const content = strings(interpretation?.content_preferences);
    const preferences = strings(interpretation?.preferences);
    const warnings = strings(interpretation?.search_warnings);
    const budget = result.request_budget as Record<string, unknown> | undefined;
    const budgetUsed = numberValue(budget?.used);
    const budgetLimit = numberValue(budget?.limit);
    const pipeline = result.candidate_pipeline as Record<string, unknown> | undefined;
    const origin = result.origin as Record<string, unknown> | undefined;
    const broadEvidence = pipeline?.broad_evidence as Record<string, unknown> | undefined;
    const caseUnavailableCalls = numberValue(broadEvidence?.unavailable_calls) ?? 0;

    if (interpretation?.location !== qaCase.expectedLocation) {
      failures.push(`${qaCase.name}: location=${String(interpretation?.location)}`);
    }
    if (interpretation?.category !== qaCase.expectedCategory) {
      failures.push(`${qaCase.name}: category=${String(interpretation?.category)}`);
    }
    if (qaCase.expectedContent && !sameStrings(content, qaCase.expectedContent)) {
      failures.push(`${qaCase.name}: content=${content.join(",")}`);
    }
    if (qaCase.expectedPreferences && !includesAll(preferences, qaCase.expectedPreferences)) {
      failures.push(`${qaCase.name}: preferences=${preferences.join(",")}`);
    }
    if (qaCase.expectedWarnings && !includesAll(warnings, qaCase.expectedWarnings)) {
      failures.push(`${qaCase.name}: warnings=${warnings.join(",")}`);
    }
    if (
      qaCase.expectedOriginAddressIncludes &&
      (typeof origin?.address !== "string" || !origin.address.includes(qaCase.expectedOriginAddressIncludes))
    ) {
      failures.push(`${qaCase.name}: origin_address=${String(origin?.address)}`);
    }
    if (verified.length + fallback.length === 0) {
      failures.push(`${qaCase.name}: empty_verified_and_fallback_results`);
    }
    if (verified.length < (qaCase.minimumVerified ?? 0)) {
      failures.push(`${qaCase.name}: verified=${verified.length},minimum=${qaCase.minimumVerified}`);
    }
    for (const recommendation of verified) {
      if (!hasSafeAttributedEvidence(recommendation)) {
        failures.push(`${qaCase.name}: unsafe_attribution=${String(recommendation.name)}`);
      }
    }
    if (fallback.some((item) => item.accessibility_status !== "unverified")) {
      failures.push(`${qaCase.name}: fallback_not_marked_unverified`);
    }
    if (verified.length > 0) {
      if (fallback.length > 0 || result.fallback_used !== false || result.fallback_reason !== null) {
        failures.push(`${qaCase.name}: verified_fallback_state_inconsistent`);
      }
    } else if (fallback.length > 0) {
      if (result.fallback_used !== true || typeof result.fallback_reason !== "string") {
        failures.push(`${qaCase.name}: unverified_fallback_state_inconsistent`);
      }
    }
    if (budgetUsed === null || budgetLimit === null || budgetUsed > budgetLimit) {
      failures.push(`${qaCase.name}: invalid_request_budget=${String(budgetUsed)}/${String(budgetLimit)}`);
    }
    if (result.search_architecture !== "place_first_evidence_second_v2") {
      failures.push(`${qaCase.name}: unexpected_search_architecture=${String(result.search_architecture)}`);
    }
    if (typeof result.answer_markdown !== "string" || !result.answer_markdown.includes("방문 전 전화 확인")) {
      failures.push(`${qaCase.name}: missing_previsit_caution`);
    }

    verifiedTotal += verified.length;
    fallbackTotal += fallback.length;
    externalCalls += budgetUsed ?? 0;
    unavailableCalls += caseUnavailableCalls;
    console.log(JSON.stringify({
      case: qaCase.name,
      location: interpretation?.location,
      category: interpretation?.category,
      content,
      preferences,
      verified: verified.map((item) => item.name),
      fallback: fallback.map((item) => item.name),
      fallback_reason: result.fallback_reason,
      budget: { used: budgetUsed, limit: budgetLimit },
      broad_unavailable_calls: caseUnavailableCalls,
      elapsed_ms: Date.now() - caseStartedAt
    }));
  }

  if (requestedCases.length === 0) {
    const supportCases = [
      {
        name: "support-gangnam-all",
        input: { location: "강남역", type: "all" as const },
        minimumFacilities: 1
      },
      {
        name: "support-seomyeon-restroom",
        input: { location: "서면역", type: "accessible_restroom" as const },
        minimumFacilities: 1,
        firstNameIncludes: "서면역"
      },
      {
        name: "support-jeju-airport-charger-sparse",
        input: { location: "제주공항", type: "wheelchair_charger" as const },
        minimumFacilities: 0
      }
    ];
    for (const supportCase of supportCases) {
      const result = await findNearbySupportFacilities(supportCase.input, config);
      const facilities = records(result.facilities);
      const origin = result.origin as Record<string, unknown> | undefined;
      const budget = result.request_budget as Record<string, unknown> | undefined;
      const used = numberValue(budget?.used);
      const limit = numberValue(budget?.limit);
      if (origin?.provider === "unresolved" || typeof origin?.address !== "string") {
        failures.push(`${supportCase.name}: unresolved_origin`);
      }
      if (facilities.length < supportCase.minimumFacilities) {
        failures.push(`${supportCase.name}: facilities=${facilities.length}`);
      }
      if (
        supportCase.firstNameIncludes &&
        (typeof facilities[0]?.name !== "string" || !facilities[0].name.includes(supportCase.firstNameIncludes))
      ) {
        failures.push(`${supportCase.name}: first_facility=${String(facilities[0]?.name)}`);
      }
      if (
        supportCase.input.type !== "all" &&
        facilities.some((facility) => facility.type !== supportCase.input.type)
      ) {
        failures.push(`${supportCase.name}: wrong_facility_type`);
      }
      if (used === null || limit === null || used > limit) {
        failures.push(`${supportCase.name}: invalid_request_budget=${String(used)}/${String(limit)}`);
      }
      if (typeof result.data_caution !== "string" || !result.data_caution.includes("미등재")) {
        failures.push(`${supportCase.name}: missing_public_data_caution`);
      }
      auxiliaryChecks += 1;
      externalCalls += used ?? 0;
      console.log(JSON.stringify({
        case: supportCase.name,
        origin: origin?.name,
        facilities: facilities.map((item) => item.name),
        budget: { used, limit }
      }));
    }

    const reviewCases = [
      {
        name: "review-known-positive",
        input: { place_name: "투썸플레이스 잠실역점", neighborhood: "잠실역", limit: 5 },
        minimumEvidence: 1
      },
      {
        name: "review-brand-landmark-collision",
        input: { place_name: "메가MGC커피 강남역신분당선점", neighborhood: "강남역", limit: 5 },
        minimumEvidence: 0
      }
    ];
    for (const reviewCase of reviewCases) {
      const result = await searchPlaceAccessibilityReviews(reviewCase.input, config);
      const evidence = records(result.results);
      const budget = result.request_budget as Record<string, unknown> | undefined;
      const used = numberValue(budget?.used);
      const limit = numberValue(budget?.limit);
      if (evidence.length < reviewCase.minimumEvidence) {
        failures.push(`${reviewCase.name}: evidence=${evidence.length}`);
      }
      for (const item of evidence) {
        if (
          item.attribution_verified !== true ||
          item.place_name_match !== "exact" ||
          !records(item.signals).some((signal) =>
            signal.polarity === "positive" &&
            (signal.subject === undefined || signal.subject === "venue")
          )
        ) {
          failures.push(`${reviewCase.name}: unsafe_evidence=${String(item.title)}`);
        }
      }
      if (used === null || limit === null || used > limit) {
        failures.push(`${reviewCase.name}: invalid_request_budget=${String(used)}/${String(limit)}`);
      }
      auxiliaryChecks += 1;
      externalCalls += used ?? 0;
      console.log(JSON.stringify({
        case: reviewCase.name,
        evidence: evidence.map((item) => item.title),
        budget: { used, limit }
      }));
    }
  }

  const summary = {
    cases: cases.length,
    auxiliary_checks: auxiliaryChecks,
    verified_recommendations: verifiedTotal,
    unverified_fallbacks: fallbackTotal,
    external_calls: externalCalls,
    broad_unavailable_calls: unavailableCalls,
    elapsed_ms: Date.now() - startedAt,
    failures: failures.length
  };
  console.log(JSON.stringify({ live_qa_summary: summary }));
  if (failures.length > 0) {
    throw new Error(`live_query_matrix_failed:\n${failures.join("\n")}`);
  }
  console.log("live_query_matrix_passed");
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
