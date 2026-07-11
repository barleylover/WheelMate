import type { AppConfig } from "../config.js";
import type { SearchSource, SourceSearchOutcome } from "../types.js";
import { normalizeDaumDocument, type DaumSearchDocument } from "../reviewSearch/resultNormalizer.js";
import type { RequestBudget } from "../utils/requestBudget.js";
import { fetchJson, safeErrorMessage } from "../utils/retry.js";

interface DaumSearchResponse {
  documents?: DaumSearchDocument[];
}

export class DaumSearchClient {
  private readonly baseUrl = "https://dapi.kakao.com";

  constructor(
    private readonly config: AppConfig,
    private readonly budget?: RequestBudget
  ) {}

  private unavailable(source: SearchSource, query: string, error: string): SourceSearchOutcome {
    return { source, query, results: [], unavailable: true, error };
  }

  private hasCredentials(): boolean {
    return Boolean(this.config.kakaoRestApiKey && this.config.useDaumSearch);
  }

  async searchBlog(query: string, size = this.config.searchResultsPerQuery, page = 1, sort = "accuracy"): Promise<SourceSearchOutcome> {
    return this.search("daum_blog", "/v2/search/blog", query, { size, page, sort });
  }

  async searchCafe(query: string, size = this.config.searchResultsPerQuery, page = 1, sort = "accuracy"): Promise<SourceSearchOutcome> {
    return this.search("daum_cafe", "/v2/search/cafe", query, { size, page, sort });
  }

  async searchWeb(query: string, size = this.config.searchResultsPerQuery, page = 1, sort = "accuracy"): Promise<SourceSearchOutcome> {
    return this.search("daum_web", "/v2/search/web", query, { size, page, sort });
  }

  async searchSource(source: SearchSource, query: string): Promise<SourceSearchOutcome> {
    if (source === "daum_blog") return this.searchBlog(query);
    if (source === "daum_cafe") return this.searchCafe(query);
    if (source === "daum_web") return this.searchWeb(query);
    return this.unavailable(source, query, "unsupported_daum_source");
  }

  private async search(
    source: SearchSource,
    path: string,
    query: string,
    params: Record<string, string | number>
  ): Promise<SourceSearchOutcome> {
    if (!this.hasCredentials()) {
      return this.unavailable(source, query, "kakao_credentials_missing_or_daum_disabled");
    }
    const url = new URL(path, this.baseUrl);
    url.searchParams.set("query", query);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, String(value));
    }
    try {
      const response = await fetchJson<DaumSearchResponse>(
        url.toString(),
        { headers: { Authorization: `KakaoAK ${this.config.kakaoRestApiKey}` } },
        this.config.searchTimeoutMs,
        this.budget
      );
      return {
        source,
        query,
        results: (response.documents ?? []).map((item) => normalizeDaumDocument(source, item))
      };
    } catch (error) {
      return this.unavailable(source, query, safeErrorMessage(error));
    }
  }
}
