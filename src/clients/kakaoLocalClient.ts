import type { AppConfig } from "../config.js";
import { categoryKeyword, kakaoCategoryCode } from "../core/categoryMapper.js";
import { distanceMeters } from "../core/distance.js";
import { fallbackOrigin } from "../core/geocode.js";
import type { Category, Origin, PlaceCandidate } from "../types.js";
import type { RequestBudget } from "../utils/requestBudget.js";
import { fetchJson, safeErrorMessage } from "../utils/retry.js";
import { administrativeCenterQuery } from "../search/locationScope.js";

interface KakaoPlaceDocument {
  id?: string;
  place_name?: string;
  category_name?: string;
  phone?: string;
  address_name?: string;
  road_address_name?: string;
  x?: string;
  y?: string;
  distance?: string;
}

interface KakaoAddressDocument {
  address_name?: string;
  x?: string;
  y?: string;
}

interface KakaoSearchResponse<T> {
  documents?: T[];
}

export class KakaoLocalClient {
  private readonly baseUrl = "https://dapi.kakao.com";

  constructor(
    private readonly config: AppConfig,
    private readonly budget?: RequestBudget
  ) {}

  hasCredentials(): boolean {
    return Boolean(this.config.kakaoRestApiKey);
  }

  async resolveLocation(location: string): Promise<Origin> {
    if (!this.hasCredentials()) {
      return fallbackOrigin(location);
    }
    try {
      const keyword = await this.keywordSearchRaw(administrativeCenterQuery(location), undefined, undefined, undefined, 1);
      const keywordDoc = keyword[0];
      if (keywordDoc?.y && keywordDoc.x) {
        return {
          name: keywordDoc.place_name ?? location,
          lat: Number(keywordDoc.y),
          lng: Number(keywordDoc.x),
          address: keywordDoc.road_address_name || keywordDoc.address_name,
          provider: "kakao_local_keyword"
        };
      }
    } catch {
      // Address search below is an independent fallback for keyword-search
      // errors as well as empty keyword results.
    }

    const address = await this.addressSearch(location);
    if (address) return address;
    return fallbackOrigin(location);
  }

  async addressSearch(query: string): Promise<Origin | null> {
    if (!this.hasCredentials()) return fallbackOrigin(query);
    const url = new URL("/v2/local/search/address.json", this.baseUrl);
    url.searchParams.set("query", query);
    try {
      const response = await fetchJson<KakaoSearchResponse<KakaoAddressDocument>>(
        url.toString(),
        { headers: { Authorization: `KakaoAK ${this.config.kakaoRestApiKey}` } },
        this.config.searchTimeoutMs,
        this.budget
      );
      const doc = response.documents?.[0];
      if (!doc?.x || !doc.y) return null;
      return {
        name: query,
        lat: Number(doc.y),
        lng: Number(doc.x),
        address: doc.address_name,
        provider: "kakao_local_address"
      };
    } catch {
      return null;
    }
  }

  async keywordSearch(
    query: string,
    x?: number,
    y?: number,
    radius?: number,
    size = this.config.maxPlaceCandidates
  ): Promise<PlaceCandidate[]> {
    return this.keywordSearchPage(query, { x, y, radius, size });
  }

  async keywordSearchPage(
    query: string,
    options: {
      x?: number;
      y?: number;
      radius?: number;
      size?: number;
      page?: number;
      sort?: "accuracy" | "distance";
      categoryGroupCode?: string;
    } = {}
  ): Promise<PlaceCandidate[]> {
    try {
      const docs = await this.keywordSearchRaw(
        query,
        options.x,
        options.y,
        options.radius,
        options.size ?? this.config.maxPlaceCandidates,
        options.page,
        options.sort,
        options.categoryGroupCode
      );
      return docs.map((doc) =>
        this.toPlaceCandidate(
          doc,
          options.x !== undefined && options.y !== undefined ? { lat: options.y, lng: options.x } : undefined
        )
      );
    } catch {
      return [];
    }
  }

  async searchNearbyPlaces(
    location: string,
    origin: Origin,
    category: Category,
    radiusM: number,
    limit: number
  ): Promise<PlaceCandidate[]> {
    if (!this.hasCredentials()) {
      return [];
    }
    const size = Math.max(1, Math.min(limit, this.config.maxPlaceCandidates));
    const code = kakaoCategoryCode(category);
    if (code) {
      const categoryResults = await this.categorySearch(code, origin.lng, origin.lat, radiusM, size);
      if (categoryResults.length > 0) return categoryResults;
    }
    const keyword = [location, categoryKeyword(category)].filter(Boolean).join(" ").trim() || location;
    return this.keywordSearch(keyword, origin.lng, origin.lat, radiusM, size);
  }

  async categorySearch(
    categoryGroupCode: string,
    x: number,
    y: number,
    radius: number,
    size = this.config.maxPlaceCandidates,
    page = 1
  ): Promise<PlaceCandidate[]> {
    if (!this.hasCredentials()) return [];
    const url = new URL("/v2/local/search/category.json", this.baseUrl);
    url.searchParams.set("category_group_code", categoryGroupCode);
    url.searchParams.set("x", String(x));
    url.searchParams.set("y", String(y));
    url.searchParams.set("radius", String(radius));
    url.searchParams.set("size", String(size));
    url.searchParams.set("page", String(Math.min(45, Math.max(1, page))));
    url.searchParams.set("sort", "distance");
    try {
      const response = await fetchJson<KakaoSearchResponse<KakaoPlaceDocument>>(
        url.toString(),
        { headers: { Authorization: `KakaoAK ${this.config.kakaoRestApiKey}` } },
        this.config.searchTimeoutMs,
        this.budget
      );
      return (response.documents ?? []).map((doc) => this.toPlaceCandidate(doc, { lat: y, lng: x }));
    } catch (error) {
      return [];
    }
  }

  private async keywordSearchRaw(
    query: string,
    x?: number,
    y?: number,
    radius?: number,
    size = this.config.maxPlaceCandidates,
    page = 1,
    sort?: "accuracy" | "distance",
    categoryGroupCode?: string
  ): Promise<KakaoPlaceDocument[]> {
    if (!this.hasCredentials()) return [];
    const url = new URL("/v2/local/search/keyword.json", this.baseUrl);
    url.searchParams.set("query", query);
    url.searchParams.set("size", String(Math.min(15, Math.max(1, size))));
    url.searchParams.set("page", String(Math.min(45, Math.max(1, page))));
    if (sort) url.searchParams.set("sort", sort);
    if (categoryGroupCode) url.searchParams.set("category_group_code", categoryGroupCode);
    if (x !== undefined && y !== undefined) {
      url.searchParams.set("x", String(x));
      url.searchParams.set("y", String(y));
    }
    if (radius !== undefined) {
      url.searchParams.set("radius", String(radius));
    }
    try {
      const response = await fetchJson<KakaoSearchResponse<KakaoPlaceDocument>>(
        url.toString(),
        { headers: { Authorization: `KakaoAK ${this.config.kakaoRestApiKey}` } },
        this.config.searchTimeoutMs,
        this.budget
      );
      return response.documents ?? [];
    } catch (error) {
      throw new Error(`kakao_local_unavailable:${safeErrorMessage(error)}`);
    }
  }

  private toPlaceCandidate(doc: KakaoPlaceDocument, origin?: { lat: number; lng: number }): PlaceCandidate {
    const lat = Number(doc.y ?? 0);
    const lng = Number(doc.x ?? 0);
    const distance = doc.distance
      ? Number.parseInt(doc.distance, 10)
      : origin
        ? distanceMeters(origin, { lat, lng })
        : undefined;
    return {
      id: doc.id,
      name: doc.place_name ?? "이름 미상",
      category: doc.category_name ?? "any",
      address: doc.address_name,
      roadAddress: doc.road_address_name,
      phone: doc.phone,
      lat,
      lng,
      distance_m: Number.isFinite(distance) ? distance : undefined,
      source: "kakao_local",
      sourcePlaceId: doc.id
    };
  }
}
