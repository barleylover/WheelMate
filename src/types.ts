export type Category =
  | "cafe"
  | "restaurant"
  | "culture"
  | "museum"
  | "restroom"
  | "charger"
  | "any";

export type SearchSource =
  | "naver_blog"
  | "naver_cafe"
  | "naver_web"
  | "daum_blog"
  | "daum_cafe"
  | "daum_web";

export type ReviewSignalGrade = "R1" | "R2" | "R3" | "R4" | "W";
export type OfficialSupportGrade = "O1" | "O2" | "C" | "none";
export type RecommendationStatus =
  | "review_positive"
  | "official_support_only"
  | "weak_or_uncertain"
  | "unverified"
  | "not_recommended";

export type SignalPolarity = "positive" | "negative" | "ambiguous";
export type SignalStrength = "strong" | "medium" | "weak";
export type SignalSubject = "venue" | "transit" | "support_facility" | "unknown";
export type SignalType =
  | "wheelchair_direct"
  | "entrance_step"
  | "ramp"
  | "elevator"
  | "restroom"
  | "seating_or_space"
  | "stroller_proxy"
  | "stairs"
  | "basement_or_floor"
  | "narrow_space"
  | "unknown";

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface Origin extends Coordinates {
  name: string;
  address?: string;
  provider?: string;
}

export interface PlaceCandidate extends Coordinates {
  id?: string;
  name: string;
  category: Category | string;
  address?: string;
  roadAddress?: string;
  phone?: string;
  distance_m?: number;
  source?: string;
  sourcePlaceId?: string;
  searchAliases?: string[];
  discoveryEvidence?: ReviewEvidence[];
}

export interface NormalizedSearchResult {
  source: SearchSource;
  title: string;
  link: string;
  snippet: string;
  date: string | null;
  containerName?: string;
}

export interface ReviewSignal {
  polarity: SignalPolarity;
  type: SignalType;
  matched_text: string;
  strength: SignalStrength;
  subject?: SignalSubject;
  context_text?: string;
}

export interface ReviewEvidence extends NormalizedSearchResult {
  place_match_score: number;
  signals: ReviewSignal[];
  place_name_match?: "exact" | "alias" | "none";
  place_matched_name?: string;
  place_matched_field?: "title" | "snippet";
  place_location_match?: boolean;
  attribution_verified?: boolean;
}

export interface SourceSearchOutcome {
  source: SearchSource;
  query: string;
  results: NormalizedSearchResult[];
  unavailable?: boolean;
  error?: string;
}

export interface ReviewAnalysis {
  place_name: string;
  address?: string;
  queries_used: string[];
  review_signal_grade: ReviewSignalGrade;
  review_signal_score: number;
  positive_signals: ReviewSignal[];
  negative_signals: ReviewSignal[];
  ambiguous_signals: ReviewSignal[];
  results: ReviewEvidence[];
  searched_sources: SearchSource[];
  source_counts: Record<SearchSource, number>;
  unavailable_sources: Partial<Record<SearchSource, string>>;
  cautions: string[];
  attribution: string[];
}

export interface SupportFacility {
  type: "accessible_restroom" | "wheelchair_charger";
  name: string;
  address?: string;
  lat?: number;
  lng?: number;
  distance_m?: number;
  opening_hours?: string;
  phone?: string;
  source: string;
  match_basis?: "coordinates" | "address_area";
}

export interface PublicSupportEvidence {
  source: string;
  source_family: "bf_certification" | "disability_facility" | "support_facility" | "culture_fallback";
  level: "building_or_facility_level" | "nearby_support_only" | "unverified";
  evidence_type:
    | "bf_certified"
    | "disability_facility"
    | "barrier_free_travel"
    | "culture_barrier_free"
    | "museum_accessibility"
    | "accessible_restroom_nearby"
    | "wheelchair_charger_nearby";
  detail: string;
  confidence: number;
  distance_m?: number;
}

export interface RankedPlace {
  rank?: number;
  place: PlaceCandidate;
  review: ReviewAnalysis;
  official_support_grade: OfficialSupportGrade;
  recommendation_status: RecommendationStatus;
  ranking_score: number;
  official_support_score: number;
  public_support_evidence: PublicSupportEvidence[];
  support_facilities_nearby: SupportFacility[];
}

export interface QueryInterpretation {
  location: string;
  scope?: "point" | "region";
  category: Category;
  radius_m: number;
  preferences: string[];
  unsupported_preferences: string[];
  content_preferences?: string[];
  content_term_source?: "explicit" | "query" | "none";
  hard_content_filter?: boolean;
  search_warnings?: string[];
}
