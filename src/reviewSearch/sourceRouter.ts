import type { AppConfig } from "../config.js";
import type { SearchSource } from "../types.js";

export function enabledSearchSources(config: AppConfig): SearchSource[] {
  if (!config.useReviewSearch) return [];
  const sources: SearchSource[] = [];
  if (config.useNaverSearch && config.useNaverBlog) sources.push("naver_blog");
  if (config.useNaverSearch && config.useNaverCafe) sources.push("naver_cafe");
  if (config.useNaverSearch && config.useNaverWeb) sources.push("naver_web");
  if (config.useDaumSearch && config.useDaumBlog) sources.push("daum_blog");
  if (config.useDaumSearch && config.useDaumCafe) sources.push("daum_cafe");
  if (config.useDaumSearch && config.useDaumWeb) sources.push("daum_web");
  return sources;
}

export function sourceAttribution(sources: SearchSource[]): string[] {
  const attribution: string[] = [];
  if (sources.some((source) => source.startsWith("naver_"))) {
    attribution.push("Naver Search API 결과 기반 참고 신호");
  }
  if (sources.some((source) => source.startsWith("daum_"))) {
    attribution.push("Daum Search API 결과 기반 참고 신호");
  }
  return attribution;
}
