import type { AppConfig } from "../config.js";
import { inferCategoryFromOsmAmenity } from "../core/categoryMapper.js";
import type { AccessibilityEvidence, Category, GeoPoint, PlaceCandidate } from "../core/types.js";
import { fetchJson } from "./http.js";

interface OverpassElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  tags?: Record<string, string>;
}

interface OverpassResponse {
  elements?: OverpassElement[];
}

export class OsmOverpassClient {
  constructor(private readonly config: AppConfig) {}

  get enabled(): boolean {
    return this.config.useOsm;
  }

  async searchNearby(origin: GeoPoint, amenities: string[], radiusM: number): Promise<PlaceCandidate[]> {
    if (!this.config.useOsm) {
      throw new Error("USE_OSM=false");
    }
    if (amenities.length === 0) {
      return [];
    }

    const amenityPattern = amenities.map(escapeRegex).join("|");
    const query = `
[out:json][timeout:10];
(
  node(around:${radiusM},${origin.lat},${origin.lng})["amenity"~"^(${amenityPattern})$"];
  way(around:${radiusM},${origin.lat},${origin.lng})["amenity"~"^(${amenityPattern})$"];
  relation(around:${radiusM},${origin.lat},${origin.lng})["amenity"~"^(${amenityPattern})$"];
);
out tags center 30;
`;

    const response = await fetchJson<OverpassResponse>(
      this.config.overpassApiUrl,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
          "User-Agent": "WheelMate/0.1 (+https://github.com/barleylover/WheelMate)"
        },
        body: new URLSearchParams({ data: query }).toString()
      },
      this.config.httpTimeoutMs
    );

    return (response.elements ?? []).flatMap((element) => this.toCandidate(element));
  }

  private toCandidate(element: OverpassElement): PlaceCandidate[] {
    const tags = element.tags ?? {};
    const name = tags.name ?? tags["name:ko"] ?? tags["name:en"];
    const lat = element.lat ?? element.center?.lat;
    const lng = element.lon ?? element.center?.lon;
    if (!name || lat === undefined || lng === undefined) {
      return [];
    }

    const category: Category = inferCategoryFromOsmAmenity(tags.amenity);
    const address = [tags["addr:province"], tags["addr:city"], tags["addr:district"], tags["addr:street"], tags["addr:housenumber"]]
      .filter(Boolean)
      .join(" ");

    return [
      {
        id: `osm:${element.type}:${element.id}`,
        name,
        category,
        address: address || undefined,
        lat,
        lng,
        source: "OSM",
        sourcePlaceId: `${element.type}/${element.id}`,
        raw: element,
        evidence: osmAccessibilityEvidence(tags)
      }
    ];
  }
}

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const osmAccessibilityEvidence = (tags: Record<string, string>): AccessibilityEvidence[] => {
  const rows: AccessibilityEvidence[] = [];
  const wheelchair = tags.wheelchair;
  if (wheelchair === "yes" || wheelchair === "limited" || wheelchair === "no") {
    rows.push({
      source: "OSM",
      level: "store_level",
      evidenceType: "osm_wheelchair",
      value: wheelchair,
      detail: `wheelchair=${wheelchair}`,
      confidence: 0.65,
      raw: tags
    });
  }

  if (tags["toilets:wheelchair"] === "yes") {
    rows.push({
      source: "OSM",
      level: "store_level",
      evidenceType: "wheelchair_restroom",
      value: true,
      detail: "toilets:wheelchair=yes",
      confidence: 0.65,
      raw: tags
    });
  }

  return rows;
};
