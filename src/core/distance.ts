import type { GeoPoint } from "./types.js";

const EARTH_RADIUS_M = 6371000;

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

export const haversineDistanceM = (
  a: Pick<GeoPoint, "lat" | "lng">,
  b: Pick<GeoPoint, "lat" | "lng">
): number => {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return Math.round(EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)));
};

export const distanceScore = (distanceM: number): number => {
  if (distanceM <= 300) {
    return 20;
  }
  if (distanceM <= 500) {
    return 15;
  }
  if (distanceM <= 800) {
    return 10;
  }
  if (distanceM <= 1200) {
    return 5;
  }
  return 0;
};
