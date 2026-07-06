import type { Category } from "./types.js";

export interface CategoryMapping {
  category: Category;
  kakaoCategoryGroupCode?: string;
  googleIncludedTypes: string[];
  osmAmenities: string[];
  koreanLabel: string;
}

const mappings: Record<Category, CategoryMapping> = {
  cafe: {
    category: "cafe",
    kakaoCategoryGroupCode: "CE7",
    googleIncludedTypes: ["cafe"],
    osmAmenities: ["cafe"],
    koreanLabel: "카페"
  },
  restaurant: {
    category: "restaurant",
    kakaoCategoryGroupCode: "FD6",
    googleIncludedTypes: ["restaurant"],
    osmAmenities: ["restaurant", "fast_food"],
    koreanLabel: "음식점"
  },
  culture: {
    category: "culture",
    googleIncludedTypes: ["museum", "art_gallery", "tourist_attraction", "library"],
    osmAmenities: ["arts_centre", "library", "theatre"],
    koreanLabel: "문화시설"
  },
  museum: {
    category: "museum",
    googleIncludedTypes: ["museum", "art_gallery"],
    osmAmenities: ["museum", "arts_centre"],
    koreanLabel: "박물관/미술관"
  },
  restroom: {
    category: "restroom",
    googleIncludedTypes: ["public_bathroom"],
    osmAmenities: ["toilets"],
    koreanLabel: "장애인 화장실"
  },
  charger: {
    category: "charger",
    googleIncludedTypes: [],
    osmAmenities: [],
    koreanLabel: "전동휠체어 급속충전기"
  },
  any: {
    category: "any",
    googleIncludedTypes: ["cafe", "restaurant", "museum", "art_gallery", "library"],
    osmAmenities: ["cafe", "restaurant", "fast_food", "museum", "library"],
    koreanLabel: "장소"
  }
};

export const normalizeCategory = (category: string | undefined): Category => {
  if (!category) {
    return "any";
  }
  return Object.prototype.hasOwnProperty.call(mappings, category) ? (category as Category) : "any";
};

export const getCategoryMapping = (category: Category): CategoryMapping => mappings[category];

export const inferCategoryFromKakao = (categoryName: string | undefined): Category => {
  const value = categoryName ?? "";
  if (value.includes("카페")) {
    return "cafe";
  }
  if (value.includes("음식점") || value.includes("식당")) {
    return "restaurant";
  }
  if (value.includes("문화") || value.includes("박물관") || value.includes("미술관")) {
    return value.includes("박물관") || value.includes("미술관") ? "museum" : "culture";
  }
  return "any";
};

export const inferCategoryFromGoogleType = (primaryType: string | undefined): Category => {
  if (primaryType === "cafe") {
    return "cafe";
  }
  if (primaryType === "restaurant") {
    return "restaurant";
  }
  if (primaryType === "museum" || primaryType === "art_gallery") {
    return "museum";
  }
  if (primaryType === "library" || primaryType === "tourist_attraction") {
    return "culture";
  }
  return "any";
};

export const inferCategoryFromOsmAmenity = (amenity: string | undefined): Category => {
  if (amenity === "cafe") {
    return "cafe";
  }
  if (amenity === "restaurant" || amenity === "fast_food") {
    return "restaurant";
  }
  if (amenity === "museum") {
    return "museum";
  }
  if (amenity === "library" || amenity === "arts_centre" || amenity === "theatre") {
    return "culture";
  }
  if (amenity === "toilets") {
    return "restroom";
  }
  return "any";
};
