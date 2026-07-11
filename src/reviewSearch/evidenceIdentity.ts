import type { ReviewEvidence } from "../types.js";
import { normalizeText } from "../core/normalize.js";

const TRACKING_PARAMETERS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "fbclid",
  "gclid"
]);

export function evidenceIdentity(
  evidence: Pick<ReviewEvidence, "source" | "link" | "title" | "snippet">
): string {
  const link = evidence.link.trim();
  if (link) {
    try {
      const url = new URL(link);
      url.hash = "";
      for (const parameter of [...url.searchParams.keys()]) {
        if (TRACKING_PARAMETERS.has(parameter.toLowerCase())) url.searchParams.delete(parameter);
      }
      url.hostname = url.hostname.replace(/^www\./, "").toLowerCase();
      if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "");
      url.searchParams.sort();
      return url.toString();
    } catch {
      return link;
    }
  }
  return `${evidence.source}:${normalizeText(evidence.title)}:${normalizeText(evidence.snippet)}`;
}
