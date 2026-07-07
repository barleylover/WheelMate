import type { NormalizedSearchResult, SearchSource } from "../types.js";
import { sanitizeHtmlText } from "./htmlSanitizer.js";

export interface NaverSearchItem {
  title?: string;
  link?: string;
  description?: string;
  bloggername?: string;
  cafename?: string;
  postdate?: string;
}

export interface DaumSearchDocument {
  title?: string;
  contents?: string;
  url?: string;
  blogname?: string;
  cafename?: string;
  datetime?: string;
}

export function normalizeNaverItem(source: SearchSource, item: NaverSearchItem): NormalizedSearchResult {
  return {
    source,
    title: sanitizeHtmlText(item.title),
    link: item.link ?? "",
    snippet: sanitizeHtmlText(item.description),
    date: item.postdate ?? null,
    containerName: item.bloggername ?? item.cafename
  };
}

export function normalizeDaumDocument(source: SearchSource, item: DaumSearchDocument): NormalizedSearchResult {
  return {
    source,
    title: sanitizeHtmlText(item.title),
    link: item.url ?? "",
    snippet: sanitizeHtmlText(item.contents),
    date: item.datetime ?? null,
    containerName: item.blogname ?? item.cafename
  };
}
