import { describe, expect, it } from "vitest";
import { determineAccessibilityGrade, scorePlace } from "../src/core/scoring.js";
import type { AccessibilityEvidence, PlaceCandidate, SupportFacility } from "../src/core/types.js";

const candidate = (evidence: AccessibilityEvidence[]): PlaceCandidate => ({
  id: "test:1",
  name: "테스트 카페",
  category: "cafe",
  address: "서울시 마포구",
  lat: 37.557,
  lng: 126.925,
  source: "test",
  evidence
});

const evidence = (
  source: string,
  evidenceType: AccessibilityEvidence["evidenceType"],
  value: AccessibilityEvidence["value"],
  level: AccessibilityEvidence["level"] = "store_level"
): AccessibilityEvidence => ({
  source,
  level,
  evidenceType,
  value,
  detail: `${evidenceType}=${value}`,
  confidence: 0.8
});

describe("scoring", () => {
  it("grades Google wheelchairAccessibleEntrance=true as A", () => {
    const result = scorePlace(candidate([evidence("Google Places", "wheelchair_entrance", true)]), 250);
    expect(result.grade).toBe("A");
    expect(result.score).toBeGreaterThanOrEqual(70);
  });

  it("excludes OSM wheelchair=no from recommendations", () => {
    const result = scorePlace(candidate([evidence("OSM", "osm_wheelchair", "no")]), 200);
    expect(result.excluded).toBe(true);
    expect(result.grade).toBe("D");
  });

  it("grades BF-only evidence as B", () => {
    const result = scorePlace(
      candidate([evidence("BF 인증 시설 정보", "bf_certified", true, "building_or_facility_level")]),
      450
    );
    expect(result.grade).toBe("B");
  });

  it("grades support-facility-only evidence as C", () => {
    const support: SupportFacility[] = [
      {
        type: "accessible_restroom",
        name: "장애인 화장실",
        lat: 37.5571,
        lng: 126.9251,
        source: "전국공중화장실표준데이터",
        distanceM: 280
      }
    ];
    const result = scorePlace(candidate([]), 350, support);
    expect(result.grade).toBe("C");
  });

  it("does not double count duplicate disability facility sources", () => {
    const result = scorePlace(
      candidate([
        evidence("전국장애인편의시설표준데이터", "disability_facility", true, "building_or_facility_level"),
        evidence("한국사회보장정보원_장애인편의시설 현황", "disability_facility", true, "building_or_facility_level")
      ]),
      250
    );
    expect(result.grade).toBe("B");
    expect(result.score).toBe(40);
  });

  it("keeps weak store evidence below A when marked unverified", () => {
    const grade = determineAccessibilityGrade(
      [evidence("Google Places", "wheelchair_entrance", true, "unverified")],
      []
    );
    expect(grade).toBe("D");
  });
});
