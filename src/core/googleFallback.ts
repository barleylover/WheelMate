import type { AccessibilityGrade } from "./types.js";

/** Google Places nearby 응답 캐시 TTL. 같은 위치 반복 질의 시 유료 API 재호출을 막는다. */
export const GOOGLE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

/**
 * Google Places(New) 의 `accessibilityOptions` 필드는 Enterprise+Atmosphere SKU 라 호출당 과금이 크다.
 * 그래서 기본적으로 fallback 으로만, 아껴서 호출한다.
 *
 * fallbackOnly 모드에서는 로컬 출처(Kakao/OSM/공공데이터)만으로 이미 매장·건물 단위(A/B 등급)
 * 접근성이 확인된 상위 후보가 있으면 Google 을 호출하지 않는다. 로컬 근거가 약할 때(C/D 뿐이거나
 * 후보가 아예 없을 때)만 Google 을 보조 근거로 불러온다.
 */
export const shouldUseGoogleFallback = (
  localTopGrades: AccessibilityGrade[],
  fallbackOnly: boolean
): boolean => {
  if (!fallbackOnly) {
    return true;
  }
  if (localTopGrades.length === 0) {
    return true;
  }
  return !localTopGrades.some((grade) => grade === "A" || grade === "B");
};
