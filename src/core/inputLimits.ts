export const MIN_RADIUS_M = 50;
export const MAX_RADIUS_M = 20_000;
export const MAX_RECOMMENDATION_LIMIT = 5;
export const MAX_REVIEW_RESULT_LIMIT = 10;

export function clampInteger(
  value: number | undefined,
  fallback: number,
  min: number,
  max: number
): number {
  const resolved = value ?? fallback;
  if (!Number.isFinite(resolved)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(resolved)));
}

export function normalizePreferenceList(values: string[] = []): string[] {
  return [...new Set(
    values
      .map((value) => value.trim().slice(0, 40))
      .filter(Boolean)
  )].slice(0, 8);
}
