import { haversineDistanceM } from "./distance.js";
import { scorePlace } from "./scoring.js";
import type { AccessibilityGrade, GeoPoint, PlaceCandidate, ScoredPlace, SupportFacility } from "./types.js";

// 랭킹은 등급 우선(A>B>C>D) → 등급 내 점수 → 거리 순. 이 순서를 바꾸지 않는다.
const GRADE_ORDER: Record<AccessibilityGrade, number> = { A: 0, B: 1, C: 2, D: 3 };

export const rankPlaces = (
  places: PlaceCandidate[],
  origin: GeoPoint,
  supportFacilities: SupportFacility[],
  radiusM: number
): ScoredPlace[] =>
  places
    .map((place) => {
      const distanceM = haversineDistanceM(origin, place);
      const nearby = supportFacilities
        .map((facility) => ({
          ...facility,
          distanceM: haversineDistanceM(place, facility)
        }))
        .filter((facility) => facility.distanceM <= radiusM)
        .sort((a, b) => a.distanceM! - b.distanceM!)
        .slice(0, 3);
      return scorePlace(place, distanceM, nearby);
    })
    .filter((scored) => !scored.excluded)
    .sort((a, b) => {
      if (a.grade !== b.grade) {
        return GRADE_ORDER[a.grade] - GRADE_ORDER[b.grade];
      }
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return a.distanceM - b.distanceM;
    });
