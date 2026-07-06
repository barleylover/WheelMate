import type { AppConfig } from "../config.js";
import { inferCategoryFromGoogleType } from "../core/categoryMapper.js";
import type { AccessibilityEvidence, Category, GeoPoint, PlaceCandidate } from "../core/types.js";
import { fetchJson } from "./http.js";

interface GooglePlace {
  id?: string;
  displayName?: { text?: string; languageCode?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  primaryType?: string;
  types?: string[];
  googleMapsUri?: string;
  nationalPhoneNumber?: string;
  accessibilityOptions?: {
    wheelchairAccessibleParking?: boolean;
    wheelchairAccessibleEntrance?: boolean;
    wheelchairAccessibleRestroom?: boolean;
    wheelchairAccessibleSeating?: boolean;
  };
}

interface GoogleNearbyResponse {
  places?: GooglePlace[];
}

export class GooglePlacesClient {
  constructor(private readonly config: AppConfig) {}

  get enabled(): boolean {
    return this.config.useGooglePlaces && Boolean(this.config.googleMapsApiKey);
  }

  async searchNearby(
    origin: GeoPoint,
    includedTypes: string[],
    radiusM: number,
    limit: number
  ): Promise<PlaceCandidate[]> {
    if (!this.enabled || !this.config.googleMapsApiKey) {
      throw new Error("GOOGLE_MAPS_API_KEY is not configured or USE_GOOGLE_PLACES=false");
    }
    if (includedTypes.length === 0) {
      return [];
    }

    const fieldMask = [
      "places.id",
      "places.displayName",
      "places.formattedAddress",
      "places.location",
      "places.primaryType",
      "places.types",
      "places.googleMapsUri",
      "places.nationalPhoneNumber",
      "places.accessibilityOptions"
    ].join(",");

    const response = await fetchJson<GoogleNearbyResponse>(
      "https://places.googleapis.com/v1/places:searchNearby",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": this.config.googleMapsApiKey,
          "X-Goog-FieldMask": fieldMask
        },
        body: JSON.stringify({
          includedTypes,
          maxResultCount: Math.min(Math.max(limit, 1), 20),
          rankPreference: "DISTANCE",
          locationRestriction: {
            circle: {
              center: {
                latitude: origin.lat,
                longitude: origin.lng
              },
              radius: radiusM
            }
          }
        })
      },
      this.config.httpTimeoutMs
    );

    return (response.places ?? []).flatMap((place) => this.toCandidate(place));
  }

  private toCandidate(place: GooglePlace): PlaceCandidate[] {
    const name = place.displayName?.text;
    const lat = place.location?.latitude;
    const lng = place.location?.longitude;
    if (!name || lat === undefined || lng === undefined) {
      return [];
    }

    const category: Category = inferCategoryFromGoogleType(place.primaryType);
    const evidence = googleAccessibilityEvidence(place);

    return [
      {
        id: `google:${place.id ?? `${name}:${lat}:${lng}`}`,
        name,
        category,
        address: place.formattedAddress,
        lat,
        lng,
        phone: place.nationalPhoneNumber,
        source: "Google Places",
        sourcePlaceId: place.id,
        googleMapsUri: place.googleMapsUri,
        raw: place,
        evidence
      }
    ];
  }
}

const addBooleanEvidence = (
  rows: AccessibilityEvidence[],
  type: AccessibilityEvidence["evidenceType"],
  value: boolean | undefined,
  detailName: string,
  raw: unknown
): void => {
  if (value === undefined) {
    return;
  }
  rows.push({
    source: "Google Places",
    level: "store_level",
    evidenceType: type,
    value,
    detail: `${detailName}=${value}`,
    confidence: value ? 0.8 : 0.6,
    raw
  });
};

export const googleAccessibilityEvidence = (place: GooglePlace): AccessibilityEvidence[] => {
  const options = place.accessibilityOptions;
  if (!options) {
    return [];
  }

  const rows: AccessibilityEvidence[] = [];
  addBooleanEvidence(
    rows,
    "wheelchair_entrance",
    options.wheelchairAccessibleEntrance,
    "wheelchairAccessibleEntrance",
    options
  );
  addBooleanEvidence(
    rows,
    "wheelchair_seating",
    options.wheelchairAccessibleSeating,
    "wheelchairAccessibleSeating",
    options
  );
  addBooleanEvidence(
    rows,
    "wheelchair_restroom",
    options.wheelchairAccessibleRestroom,
    "wheelchairAccessibleRestroom",
    options
  );
  addBooleanEvidence(
    rows,
    "wheelchair_parking",
    options.wheelchairAccessibleParking,
    "wheelchairAccessibleParking",
    options
  );
  return rows;
};
