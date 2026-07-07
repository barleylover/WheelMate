import type { Category } from "../types.js";

const KAKAO_CATEGORY_CODES: Partial<Record<Category, string>> = {
  cafe: "CE7",
  restaurant: "FD6",
  culture: "CT1",
  museum: "CT1"
};

const CATEGORY_KEYWORDS: Record<Category, string> = {
  cafe: "카페",
  restaurant: "음식점",
  culture: "문화시설",
  museum: "박물관 미술관",
  restroom: "장애인 화장실",
  charger: "전동휠체어 충전기",
  any: ""
};

export function normalizeCategory(value?: string): Category {
  const normalized = value?.trim().toLowerCase();
  if (
    normalized === "cafe" ||
    normalized === "restaurant" ||
    normalized === "culture" ||
    normalized === "museum" ||
    normalized === "restroom" ||
    normalized === "charger" ||
    normalized === "any"
  ) {
    return normalized;
  }
  return "any";
}

export function kakaoCategoryCode(category: Category): string | undefined {
  return KAKAO_CATEGORY_CODES[category];
}

export function categoryKeyword(category: Category): string {
  return CATEGORY_KEYWORDS[category];
}
