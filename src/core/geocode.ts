import type { Origin } from "../types.js";

const FALLBACK_ORIGINS: Record<string, Origin> = {
  "홍대입구역": { name: "홍대입구역", lat: 37.557192, lng: 126.925381, provider: "local_fallback" },
  "강남역": { name: "강남역", lat: 37.497952, lng: 127.027619, provider: "local_fallback" },
  "서울시청": { name: "서울시청", lat: 37.566295, lng: 126.977945, provider: "local_fallback" },
  "수원역": { name: "수원역", lat: 37.266167, lng: 126.999983, provider: "local_fallback" },
  "성수동": { name: "성수동", lat: 37.544581, lng: 127.055961, provider: "local_fallback" }
};

export function fallbackOrigin(location: string): Origin {
  const trimmed = location.trim();
  return FALLBACK_ORIGINS[trimmed] ?? { name: trimmed, lat: 0, lng: 0, provider: "unresolved" };
}
