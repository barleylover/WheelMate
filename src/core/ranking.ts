import { haversineDistanceM } from "./distance.js";
import { scorePlace } from "./scoring.js";
import type { GeoPoint, PlaceCandidate, ScoredPlace, SupportFacility } from "./types.js";

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
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return a.distanceM - b.distanceM;
    });
