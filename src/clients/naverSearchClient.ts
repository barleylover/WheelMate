import type { AppConfig } from "../config.js";
import type { SearchSource, SourceSearchOutcome } from "../types.js";
import { fetchJson, safeErrorMessage } from "../utils/retry.js";
import { normalizeNaverItem, type NaverSearchItem } from "../reviewSearch/resultNormalizer.js";
import type { RequestBudget } from "../utils/requestBudget.js";

interface NaverSearchResponse {
  items?: NaverSearchItem[];
}

export class NaverSearchClient {
  private readonly baseUrl = "https://openapi.naver.com";

  constructor(
    private readonly config: AppConfig,
    private readonly budget?: RequestBudget
  ) {}

  private unavailable(source: SearchSource, query: string, error: string): SourceSearchOutcome {
    return { source, query, results: [], unavailable: true, error };
  }

  private hasCredentials(): boolean {
    return Boolean(this.config.naverClientId && this.config.naverClientSecret && this.config.useNaverSearch);
  }

  async searchBlog(query: string, display = this.config.searchResultsPerQuery, start = 1, sort = "sim"): Promise<SourceSearchOutcome> {
    return this.search("naver_blog", "/v1/search/blog.json", query, { display, start, sort });
  }

  async searchCafeArticle(query: string, display = this.config.searchResultsPerQuery, start = 1, sort = "sim"): Promise<SourceSearchOutcome> {
    return this.search("naver_cafe", "/v1/search/cafearticle.json", query, { display, start, sort });
  }

  async searchWeb(query: string, display = this.config.searchResultsPerQuery, start = 1): Promise<SourceSearchOutcome> {
    return this.search("naver_web", "/v1/search/webkr.json", query, { display, start });
  }

  async searchSource(source: SearchSource, query: string): Promise<SourceSearchOutcome> {
    if (source === "naver_blog") return this.searchBlog(query);
    if (source === "naver_cafe") return this.searchCafeArticle(query);
    if (source === "naver_web") return this.searchWeb(query);
    return this.unavailable(source, query, "unsupported_naver_source");
  }

  private async search(
    source: SearchSource,
    path: string,
    query: string,
    params: Record<string, string | number>
  ): Promise<SourceSearchOutcome> {
    if (!this.hasCredentials()) {
      return this.unavailable(source, query, "naver_credentials_missing_or_disabled");
    }
    const url = new URL(path, this.baseUrl);
    url.searchParams.set("query", query);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, String(value));
    }
    try {
      const response = await fetchJson<NaverSearchResponse>(
        url.toString(),
        {
          headers: {
            "X-Naver-Client-Id": this.config.naverClientId!,
            "X-Naver-Client-Secret": this.config.naverClientSecret!
          }
        },
        this.config.searchTimeoutMs,
        this.budget
      );
      return {
        source,
        query,
        results: (response.items ?? []).map((item) => normalizeNaverItem(source, item))
      };
    } catch (error) {
      return this.unavailable(source, query, safeErrorMessage(error));
    }
  }
}
