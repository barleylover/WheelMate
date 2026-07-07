import type { OfficialSupportGrade, RankedPlace, RecommendationStatus, ReviewSignalGrade } from "../types.js";

const GRADE_PRIORITY: Record<ReviewSignalGrade | OfficialSupportGrade, number> = {
  R1: 6,
  R2: 5,
  O1: 4,
  R3: 3,
  O2: 2,
  R4: 1,
  W: 0,
  C: 0,
  none: 0
};

function rankingBand(reviewGrade: ReviewSignalGrade, officialGrade: OfficialSupportGrade): "R1" | "R2" | "O1" | "R3" | "O2" | "R4" | "W" {
  if (reviewGrade === "W") return "W";
  if (reviewGrade === "R1") return "R1";
  if (reviewGrade === "R2") return "R2";
  if (officialGrade === "O1") return "O1";
  if (reviewGrade === "R3") return "R3";
  if (officialGrade === "O2") return "O2";
  return "R4";
}

export function recommendationStatus(reviewGrade: ReviewSignalGrade, officialGrade: OfficialSupportGrade): RecommendationStatus {
  if (reviewGrade === "W") return "not_recommended";
  if (reviewGrade === "R1" || reviewGrade === "R2") return "review_positive";
  if (officialGrade === "O1" || officialGrade === "O2") return "official_support_only";
  if (reviewGrade === "R3") return "weak_or_uncertain";
  return "unverified";
}

export function calculateRankingScore(
  reviewGrade: ReviewSignalGrade,
  reviewScore: number,
  officialGrade: OfficialSupportGrade,
  officialScore: number
): number {
  const band = rankingBand(reviewGrade, officialGrade);
  if (band === "R1") return 500 + reviewScore + officialScore;
  if (band === "R2") return 400 + reviewScore + officialScore;
  if (band === "O1") return 350 + officialScore + reviewScore * 0.3;
  if (band === "R3") return 300 + reviewScore + officialScore;
  if (band === "O2") return 200 + officialScore;
  if (band === "R4") return 100;
  return 0;
}

export function sortRankedPlaces(items: RankedPlace[]): RankedPlace[] {
  return [...items].sort((a, b) => {
    const bandA = rankingBand(a.review.review_signal_grade, a.official_support_grade);
    const bandB = rankingBand(b.review.review_signal_grade, b.official_support_grade);
    const priorityDiff = GRADE_PRIORITY[bandB] - GRADE_PRIORITY[bandA];
    if (priorityDiff !== 0) return priorityDiff;
    const scoreDiff = b.review.review_signal_score - a.review.review_signal_score;
    if (scoreDiff !== 0) return scoreDiff;
    return (a.place.distance_m ?? Number.POSITIVE_INFINITY) - (b.place.distance_m ?? Number.POSITIVE_INFINITY);
  });
}

export function partitionRankedPlaces(items: RankedPlace[], includeUnverified = false): {
  recommendations: RankedPlace[];
  notRecommended: RankedPlace[];
  unverified: RankedPlace[];
} {
  const notRecommended = items.filter((item) => item.review.review_signal_grade === "W");
  const unverified = items.filter(
    (item) =>
      item.review.review_signal_grade === "R4" &&
      item.official_support_grade === "none"
  );
  const recommendations = sortRankedPlaces(
    items.filter((item) => {
      if (item.review.review_signal_grade === "W") return false;
      if (!includeUnverified && item.review.review_signal_grade === "R4" && item.official_support_grade === "none") return false;
      return true;
    })
  );
  return { recommendations, notRecommended, unverified };
}
