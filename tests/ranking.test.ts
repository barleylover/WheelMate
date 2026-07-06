import { describe, expect, it } from "vitest";
import { rankPlaces } from "../src/core/ranking.js";
import type { AccessibilityEvidence, GeoPoint, PlaceCandidate, SupportFacility } from "../src/core/types.js";

const origin: GeoPoint = { name: "origin", lat: 37.5, lng: 127.0 };

const place = (id: string, lat: number, lng: number, evidence: AccessibilityEvidence[] = []): PlaceCandidate => ({
  id,
  name: id,
  category: "cafe",
  lat,
  lng,
  source: "test",
  evidence
});

const bf: AccessibilityEvidence = {
  source: "BF 인증",
  level: "building_or_facility_level",
  evidenceType: "bf_certified",
  value: true,
  detail: "bf_certified=true",
  confidence: 0.9
};

describe("rankPlaces: 등급 우선 정렬", () => {
  it("등급을 점수보다 우선한다 — 점수가 더 높은 C 등급보다 B 등급이 앞선다", () => {
    const near = place("C-near", 37.5000, 127.0005); // 약 44m, 주변 편의시설만 → C
    const far = place("B-far", 37.509, 127.0, [bf]); // 약 1km, BF → B
    const support: SupportFacility[] = [
      { type: "accessible_restroom", name: "화장실", lat: 37.5, lng: 127.0005, source: "s" },
      { type: "wheelchair_charger", name: "충전기", lat: 37.5, lng: 127.0005, source: "s" }
    ];

    const ranked = rankPlaces([near, far], origin, support, 300);

    expect(ranked[0]?.grade).toBe("B");
    expect(ranked[0]?.place.id).toBe("B-far");
    expect(ranked[1]?.place.id).toBe("C-near");
    // C 후보가 점수는 더 높지만 등급 우선 원칙에 따라 뒤에 온다.
    expect(ranked[1]!.score).toBeGreaterThan(ranked[0]!.score);
  });

  it("같은 등급 안에서는 점수(=거리 근접) 높은 순으로 정렬한다", () => {
    const nearB = place("B1", 37.5001, 127.0, [bf]); // 약 11m
    const farB = place("B2", 37.505, 127.0, [bf]); // 약 555m

    const ranked = rankPlaces([farB, nearB], origin, [], 300);

    expect(ranked[0]?.place.id).toBe("B1");
    expect(ranked[1]?.place.id).toBe("B2");
  });
});
