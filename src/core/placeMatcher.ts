import { haversineDistanceM } from "./distance.js";
import { stringSimilarity, tokenSimilarity } from "./normalize.js";
import type { PlaceCandidate } from "./types.js";

export interface MatchResult {
  score: number;
  distanceM: number;
  strength: "strong" | "weak" | "none";
}

const geoProximityScore = (distanceM: number): number => {
  if (distanceM <= 50) {
    return 1;
  }
  if (distanceM <= 100) {
    return 0.75;
  }
  if (distanceM <= 200) {
    return 0.45;
  }
  return 0;
};

export const matchPlaces = (
  a: Pick<PlaceCandidate, "name" | "address" | "roadAddress" | "lat" | "lng">,
  b: Pick<PlaceCandidate, "name" | "address" | "roadAddress" | "lat" | "lng">
): MatchResult => {
  const distanceM = haversineDistanceM(a, b);
  const nameScore = stringSimilarity(a.name, b.name);
  const addressScore = Math.max(
    tokenSimilarity(a.roadAddress ?? a.address, b.roadAddress ?? b.address),
    tokenSimilarity(a.address, b.address)
  );
  const geoScore = geoProximityScore(distanceM);

  let score = nameScore * 0.45 + addressScore * 0.35 + geoScore * 0.2;

  if (distanceM > 200 && nameScore < 0.92) {
    score = Math.min(score, 0.54);
  }

  if (score >= 0.75) {
    return { score, distanceM, strength: "strong" };
  }
  if (score >= 0.55) {
    return { score, distanceM, strength: "weak" };
  }
  return { score, distanceM, strength: "none" };
};
