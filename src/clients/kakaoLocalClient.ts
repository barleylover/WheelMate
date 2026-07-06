import type { AppConfig } from "../config.js";
import { inferCategoryFromKakao } from "../core/categoryMapper.js";
import type { Category, GeoPoint, PlaceCandidate } from "../core/types.js";
import { fetchJson } from "./http.js";

interface KakaoLocalDocument {
  id?: string;
  place_name?: string;
  category_name?: string;
  phone?: string;
  address_name?: string;
  road_address_name?: string;
  place_url?: string;
  x?: string;
  y?: string;
}

interface KakaoLocalResponse {
  documents?: KakaoLocalDocument[];
}

export class KakaoLocalClient {
  constructor(private readonly config: AppConfig) {}

  get enabled(): boolean {
    return Boolean(this.config.kakaoRestApiKey);
  }

  private async get(path: string, params: Record<string, string | number | undefined>): Promise<KakaoLocalResponse> {
    if (!this.config.kakaoRestApiKey) {
      throw new Error("KAKAO_REST_API_KEY is not configured");
    }
    const url = new URL(`https://dapi.kakao.com${path}`);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }

    return fetchJson<KakaoLocalResponse>(
      url.toString(),
      {
        method: "GET",
        headers: {
          Authorization: `KakaoAK ${this.config.kakaoRestApiKey}`
        }
      },
      this.config.httpTimeoutMs
    );
  }

  async addressSearch(query: string): Promise<GeoPoint | undefined> {
    const response = await this.get("/v2/local/search/address.json", { query, size: 1 });
    const doc = response.documents?.[0];
    if (!doc?.x || !doc.y) {
      return undefined;
    }
    return {
      name: query,
      lat: Number(doc.y),
      lng: Number(doc.x),
      address: doc.road_address_name || doc.address_name,
      provider: "Kakao Local"
    };
  }

  async keywordSearch(
    query: string,
    lng?: number,
    lat?: number,
    radiusM?: number,
    limit = 10
  ): Promise<PlaceCandidate[]> {
    const response = await this.get("/v2/local/search/keyword.json", {
      query,
      x: lng,
      y: lat,
      radius: radiusM,
      size: Math.min(limit, 15)
    });
    return (response.documents ?? []).flatMap((doc) => this.toPlace(doc));
  }

  async categorySearch(
    categoryGroupCode: string,
    lng: number,
    lat: number,
    radiusM: number,
    limit = 10
  ): Promise<PlaceCandidate[]> {
    // 카카오 카테고리 검색은 1회 호출당 최대 15건이므로, 최대 2페이지(최대 30건)까지 수집한다.
    const pageSize = 15;
    const maxPages = 2;
    const pagesNeeded = Math.min(maxPages, Math.max(1, Math.ceil(limit / pageSize)));
    const results: PlaceCandidate[] = [];
    const seen = new Set<string>();

    for (let page = 1; page <= pagesNeeded; page += 1) {
      const response = await this.get("/v2/local/search/category.json", {
        category_group_code: categoryGroupCode,
        x: lng,
        y: lat,
        radius: radiusM,
        size: pageSize,
        page,
        sort: "distance"
      });
      const docs = response.documents ?? [];
      for (const doc of docs) {
        for (const place of this.toPlace(doc)) {
          if (!seen.has(place.id)) {
            seen.add(place.id);
            results.push(place);
          }
        }
      }
      if (docs.length < pageSize || results.length >= limit) {
        break;
      }
    }

    return results.slice(0, limit);
  }

  async resolveLocation(query: string): Promise<GeoPoint | undefined> {
    const address = await this.addressSearch(query);
    if (address) {
      return address;
    }
    const keyword = await this.keywordSearch(query, undefined, undefined, undefined, 1);
    const first = keyword[0];
    if (!first) {
      return undefined;
    }
    return {
      name: first.name,
      lat: first.lat,
      lng: first.lng,
      address: first.roadAddress ?? first.address,
      provider: "Kakao Local"
    };
  }

  private toPlace(doc: KakaoLocalDocument): PlaceCandidate[] {
    if (!doc.place_name || !doc.x || !doc.y) {
      return [];
    }
    const category: Category = inferCategoryFromKakao(doc.category_name);
    return [
      {
        id: `kakao:${doc.id ?? `${doc.place_name}:${doc.x}:${doc.y}`}`,
        name: doc.place_name,
        category,
        address: doc.address_name,
        roadAddress: doc.road_address_name,
        lat: Number(doc.y),
        lng: Number(doc.x),
        phone: doc.phone,
        source: "Kakao Local",
        sourcePlaceId: doc.id,
        kakaoPlaceUrl: doc.place_url,
        raw: doc,
        evidence: []
      }
    ];
  }
}
