export type Category =
  | "cafe"
  | "restaurant"
  | "culture"
  | "museum"
  | "restroom"
  | "charger"
  | "any";

export type EvidenceLevel =
  | "store_level"
  | "building_or_facility_level"
  | "nearby_support_only"
  | "unverified";

export type EvidenceType =
  | "wheelchair_entrance"
  | "wheelchair_seating"
  | "wheelchair_restroom"
  | "wheelchair_parking"
  | "osm_wheelchair"
  | "bf_certified"
  | "disability_facility"
  | "entrance_ramp"
  | "threshold_removed"
  | "elevator"
  | "building_accessible_restroom"
  | "accessible_restroom_nearby"
  | "wheelchair_charger_nearby"
  | "provider_unavailable";

export type AccessibilityGrade = "A" | "B" | "C" | "D";

export type SupportFacilityType = "accessible_restroom" | "wheelchair_charger";

export interface GeoPoint {
  name: string;
  lat: number;
  lng: number;
  address?: string;
  provider?: string;
}

export interface PlaceCandidate {
  id: string;
  name: string;
  category: Category;
  address?: string;
  roadAddress?: string;
  lat: number;
  lng: number;
  phone?: string;
  source: string;
  sourcePlaceId?: string;
  googleMapsUri?: string;
  kakaoPlaceUrl?: string;
  raw?: unknown;
  evidence: AccessibilityEvidence[];
}

export interface AccessibilityEvidence {
  source: string;
  level: EvidenceLevel;
  evidenceType: EvidenceType;
  value: string | boolean | number | null;
  detail: string;
  confidence: number;
  matchStrength?: "strong" | "weak" | "unmatched";
  raw?: unknown;
}

/**
 * 건물·시설 단위 접근성 레코드(예: 전국장애인편의시설표준데이터).
 * 후보 장소에 좌표·주소·이름으로 매칭되어 접근성 근거로 부여된다.
 */
export interface BuildingAccessibility {
  name: string;
  address?: string;
  roadAddress?: string;
  lat: number;
  lng: number;
  bfCertified: boolean;
  hasElevator: boolean;
  hasAccessibleRestroom: boolean;
  hasThresholdRemoved: boolean;
  hasEntranceRamp: boolean;
  hasAccessibleParking: boolean;
  source: string;
  raw?: unknown;
  distanceM?: number;
}

export interface SupportFacility {
  type: SupportFacilityType;
  name: string;
  address?: string;
  lat: number;
  lng: number;
  openingHours?: string;
  phone?: string;
  source: string;
  raw?: unknown;
  distanceM?: number;
}

export interface SourceStatus {
  source: string;
  status: "ok" | "disabled" | "unavailable" | "skipped";
  reason?: string;
}

export interface ScoredPlace {
  place: PlaceCandidate;
  distanceM: number;
  score: number;
  grade: AccessibilityGrade;
  excluded: boolean;
  supportFacilitiesNearby: SupportFacility[];
}

export interface RecommendAccessiblePlacesInput {
  query?: string;
  location: string;
  category?: Category;
  radius_m?: number;
  limit?: number;
  preferences?: string[];
  exclude_franchise?: boolean;
}

export interface RecommendationResponse {
  query_interpretation: {
    location: string;
    category: Category;
    radius_m: number;
    exclude_franchise: boolean;
  };
  origin: GeoPoint;
  recommendations: Array<{
    rank: number;
    name: string;
    category: Category;
    address?: string;
    distance_m: number;
    accessibility_grade: AccessibilityGrade;
    score: number;
    confirmed_accessibility: string[];
    recommendation_reason: string;
    support_facilities_nearby: Array<{
      type: SupportFacilityType;
      name: string;
      distance_m: number;
    }>;
    evidence: Array<{
      source: string;
      level: EvidenceLevel;
      detail: string;
    }>;
    unknown_or_unverified: string[];
    cautions: string[];
    links: {
      kakao_map: string;
      kakao_route: string;
      google_maps?: string;
    };
    attribution: string[];
  }>;
  fallback_used: boolean;
  source_status: SourceStatus[];
  message_for_user: string;
}
