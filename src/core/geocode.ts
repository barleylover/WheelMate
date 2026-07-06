import type { GeoPoint } from "./types.js";

const knownLocations: Record<string, GeoPoint> = {
  홍대입구역: {
    name: "홍대입구역",
    lat: 37.557192,
    lng: 126.925381,
    address: "서울특별시 마포구 양화로",
    provider: "fallback_known_location"
  },
  강남역: {
    name: "강남역",
    lat: 37.497952,
    lng: 127.027619,
    address: "서울특별시 강남구 강남대로",
    provider: "fallback_known_location"
  },
  서울시청: {
    name: "서울시청",
    lat: 37.566295,
    lng: 126.977945,
    address: "서울특별시 중구 세종대로 110",
    provider: "fallback_known_location"
  },
  수원역: {
    name: "수원역",
    lat: 37.265974,
    lng: 126.999874,
    address: "경기도 수원시 팔달구 덕영대로",
    provider: "fallback_known_location"
  }
};

export const knownLocationFallback = (query: string): GeoPoint | undefined => {
  const compact = query.replace(/\s+/g, "");
  return knownLocations[compact];
};
