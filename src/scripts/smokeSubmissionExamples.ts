import { config } from "../config.js";
import {
  recommendAccessiblePlacesByReviewSearch,
  type RecommendAccessiblePlacesInput
} from "../mcp/tools/recommendAccessiblePlacesByReviewSearch.js";
import { assessPlaceRelevance, placeEvidenceIsAttributable } from "../reviewSearch/placeRelevance.js";
import type { ReviewSignal } from "../types.js";

interface SmokeCase {
  name: string;
  input: RecommendAccessiblePlacesInput;
  expectedLocation: string;
  expectedCategory: string;
  expectNoContentFilter?: boolean;
  minimumVerified: number;
}

const CASES: SmokeCase[] = [
  {
    name: "submitted-example-1",
    input: { query: "잠실역 근처 휠체어 접근성 좋은 카페 찾아줘" },
    expectedLocation: "잠실역",
    expectedCategory: "cafe",
    expectNoContentFilter: true,
    minimumVerified: 1
  },
  {
    name: "reviewer-seoul-whole",
    input: { location: "서울 전체", category: "cafe" },
    expectedLocation: "서울",
    expectedCategory: "cafe",
    expectNoContentFilter: true,
    minimumVerified: 1
  },
  {
    name: "submitted-example-2",
    input: { query: "휠체어 타고 갈건데, 부산 서면역 근처 음식점 추천해줘" },
    expectedLocation: "부산 서면역",
    expectedCategory: "restaurant",
    expectNoContentFilter: true,
    minimumVerified: 1
  },
  {
    name: "submitted-example-3",
    input: { query: "제주도 횟집 휠체어 타고 가기 편한 곳 추천해줘" },
    expectedLocation: "제주도",
    expectedCategory: "restaurant",
    minimumVerified: 1
  }
];

function records(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    : [];
}

function hasAttributedEvidence(
  recommendation: Record<string, unknown>,
  neighborhood: string | undefined
): boolean {
  const name = typeof recommendation.name === "string" ? recommendation.name : "";
  if (!name) return false;
  return records(recommendation.review_evidence).some((evidence) => {
    const title = typeof evidence.title === "string" ? evidence.title : "";
    const snippet = typeof evidence.snippet === "string" ? evidence.snippet : "";
    const signals = records(evidence.signals) as unknown as ReviewSignal[];
    const assessment = assessPlaceRelevance(
      { title, snippet },
      { placeName: name, neighborhood }
    );
    const independentlyAttributable = assessment.name_match === "exact" &&
      placeEvidenceIsAttributable({ title, snippet }, assessment, signals);
    const serializedAuditPassed = evidence.attribution_verified === true &&
      evidence.place_name_match === "exact" &&
      signals.some((signal) =>
        signal.polarity === "positive" && (!signal.subject || signal.subject === "venue")
      );
    return independentlyAttributable || serializedAuditPassed;
  });
}

async function main(): Promise<void> {
  const failures: string[] = [];
  for (const smokeCase of CASES) {
    const result = await recommendAccessiblePlacesByReviewSearch(smokeCase.input, config);
    const interpretation = result.query_interpretation as Record<string, unknown> | undefined;
    const verified = records(result.recommendations);
    const fallback = records(result.fallback_recommendations);
    const contentPreferences = Array.isArray(interpretation?.content_preferences)
      ? interpretation.content_preferences
      : [];

    if (interpretation?.location !== smokeCase.expectedLocation) {
      failures.push(`${smokeCase.name}: location=${String(interpretation?.location)}`);
    }
    if (interpretation?.category !== smokeCase.expectedCategory) {
      failures.push(`${smokeCase.name}: category=${String(interpretation?.category)}`);
    }
    if (smokeCase.expectNoContentFilter && contentPreferences.length > 0) {
      failures.push(`${smokeCase.name}: unexpected_content_filter=${contentPreferences.join(",")}`);
    }
    if (verified.length + fallback.length === 0) {
      failures.push(`${smokeCase.name}: empty_verified_and_fallback_results`);
    }
    if (verified.length < smokeCase.minimumVerified) {
      failures.push(`${smokeCase.name}: verified=${verified.length},minimum=${smokeCase.minimumVerified}`);
    }
    const neighborhood = interpretation?.scope === "point" && typeof interpretation.location === "string"
      ? interpretation.location
      : undefined;
    for (const recommendation of verified) {
      if (!hasAttributedEvidence(recommendation, neighborhood)) {
        failures.push(`${smokeCase.name}: unattributed_evidence=${String(recommendation.name)}`);
      }
    }
    if (fallback.some((item) => item.accessibility_status !== "unverified")) {
      failures.push(`${smokeCase.name}: fallback_not_marked_unverified`);
    }

    console.log(JSON.stringify({
      case: smokeCase.name,
      location: interpretation?.location,
      category: interpretation?.category,
      content_preferences: contentPreferences,
      verified_count: verified.length,
      verified_places: verified.map((item) => item.name),
      verified_sources: verified.map((item) => records(item.review_evidence)[0]?.title),
      verification_required_count: fallback.length,
      fallback_used: result.fallback_used,
      fallback_reason: result.fallback_reason,
      candidate_pipeline: result.candidate_pipeline
    }));
  }

  if (failures.length > 0) {
    throw new Error(`submission_smoke_failed:\n${failures.join("\n")}`);
  }
  console.log("submission_smoke_passed");
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
