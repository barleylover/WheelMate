import type { ReviewEvidence, ReviewSignal, ReviewSignalGrade } from "../types.js";

export interface ReviewScoreResult {
  grade: ReviewSignalGrade;
  score: number;
  positive: ReviewSignal[];
  negative: ReviewSignal[];
  ambiguous: ReviewSignal[];
}

function yearsOld(date: string | null): number | null {
  if (!date) return null;
  const normalized = date.length === 8 ? `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}` : date;
  const parsed = Date.parse(normalized);
  if (!Number.isFinite(parsed)) return null;
  return (Date.now() - parsed) / (365.25 * 24 * 60 * 60 * 1000);
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(99, Math.round(value)));
}

export function scoreReviewEvidence(evidence: ReviewEvidence[]): ReviewScoreResult {
  const signals = evidence.flatMap((item) => item.signals);
  const positive = signals.filter((signal) => signal.polarity === "positive");
  const negative = signals.filter((signal) => signal.polarity === "negative");
  const ambiguous = signals.filter((signal) => signal.polarity === "ambiguous");
  const strongPositive = positive.filter((signal) => signal.strength === "strong");
  const strongNegative = negative.filter((signal) => signal.strength === "strong");
  const weakPositive = positive.filter((signal) => signal.strength !== "strong");
  const positiveSources = new Set(evidence.filter((item) => item.signals.some((signal) => signal.polarity === "positive")).map((item) => item.source));
  const negativeResults = evidence.filter((item) => item.signals.some((signal) => signal.polarity === "negative")).length;
  const conflict = positive.length > 0 && negative.length > 0;

  let rawScore = 0;
  rawScore += strongPositive.length * 35;
  rawScore += weakPositive.length * 15;
  if (positiveSources.size >= 2) rawScore += 10;
  for (const item of evidence) {
    const age = yearsOld(item.date);
    if (age !== null && age <= 2) rawScore += 8;
    else if (age !== null && age <= 5) rawScore += 4;
    if (item.place_match_score >= 0.85) rawScore += 10;
    else if (item.place_match_score >= 0.65) rawScore += 5;
    else if (item.place_match_score >= 0.45) rawScore += 2;
  }
  rawScore -= strongNegative.length * 60;
  rawScore -= ambiguous.length * 15;
  if (conflict) rawScore -= 30;

  let grade: ReviewSignalGrade = "R4";
  if (strongNegative.length >= 1 || negativeResults >= 2 || (strongPositive.length > 0 && strongNegative.length > 0)) {
    grade = "W";
  } else if (strongPositive.length >= 1 || positiveSources.size >= 2) {
    grade = "R1";
  } else if (weakPositive.length >= 1) {
    grade = "R2";
  } else if (ambiguous.length >= 1) {
    grade = "R3";
  }

  return {
    grade,
    score: clampScore(rawScore),
    positive,
    negative,
    ambiguous
  };
}
