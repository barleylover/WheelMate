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

function isFloorOnlySignal(signal: ReviewSignal): boolean {
  return signal.type === "basement_or_floor";
}

function positiveEvidenceIsCurrentEnough(item: ReviewEvidence): boolean {
  const age = yearsOld(item.date);
  // Search APIs do not always expose a date, so unknown dates stay usable but
  // are explicitly cautioned in the response. A known positive report older
  // than five years, or implausibly far in the future, cannot by itself prove
  // current accessibility.
  return age === null || (age >= -0.25 && age <= 5);
}

export function scoreReviewEvidence(evidence: ReviewEvidence[]): ReviewScoreResult {
  const signals = evidence.flatMap((item) => item.signals);
  const venueSignals = signals.filter((signal) => !signal.subject || signal.subject === "venue");
  const currentPositiveEvidence = evidence.filter(positiveEvidenceIsCurrentEnough);
  const positive = currentPositiveEvidence
    .flatMap((item) => item.signals)
    .filter((signal) => (!signal.subject || signal.subject === "venue") && signal.polarity === "positive");
  const negative = venueSignals.filter((signal) => signal.polarity === "negative");
  const ambiguous = signals.filter((signal) => signal.polarity === "ambiguous");
  const venueAmbiguous = venueSignals.filter((signal) => signal.polarity === "ambiguous");
  const strongPositive = positive.filter((signal) => signal.strength === "strong");
  const strongNegative = negative.filter((signal) => signal.strength === "strong");
  const mediumPositive = positive.filter((signal) => signal.strength === "medium");
  const weakPositive = positive.filter((signal) => signal.strength === "weak");
  const nonFloorPositive = positive.filter((signal) => !isFloorOnlySignal(signal));
  const strongNonFloorPositive = strongPositive.filter((signal) => !isFloorOnlySignal(signal));
  const positiveSources = new Set(
    currentPositiveEvidence
      .filter((item) => item.signals.some((signal) => signal.polarity === "positive" && !isFloorOnlySignal(signal)))
      .filter((item) => item.signals.some((signal) => (!signal.subject || signal.subject === "venue") && signal.polarity === "positive" && !isFloorOnlySignal(signal)))
      .map((item) => item.source)
  );
  const negativeResults = evidence.filter((item) => item.signals.some((signal) =>
    (!signal.subject || signal.subject === "venue") && signal.polarity === "negative"
  )).length;
  const conflict = positive.length > 0 && negative.length > 0;

  let rawScore = 0;
  rawScore += strongNonFloorPositive.length * 35;
  rawScore += mediumPositive.length * 24;
  rawScore += weakPositive.filter((signal) => !isFloorOnlySignal(signal)).length * 12;
  rawScore += positive.filter(isFloorOnlySignal).length * 3;
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
  rawScore -= venueAmbiguous.length * 15;
  if (conflict) rawScore -= 30;

  let grade: ReviewSignalGrade = "R4";
  if (strongNegative.length >= 1 || negativeResults >= 2 || (strongNonFloorPositive.length > 0 && strongNegative.length > 0)) {
    grade = "W";
  } else if (strongNonFloorPositive.length >= 1 || positiveSources.size >= 2) {
    grade = "R1";
  } else if (nonFloorPositive.length >= 1) {
    grade = "R2";
  } else if (venueAmbiguous.length >= 1) {
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
