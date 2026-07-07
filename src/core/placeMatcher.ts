import type { PlaceCandidate } from "../types.js";
import { normalizeText } from "./normalize.js";

export function compactPlaceName(name: string): string {
  return normalizeText(name).replace(/\s+/g, "");
}

export function isLikelySamePlace(a: Pick<PlaceCandidate, "name" | "address">, b: Pick<PlaceCandidate, "name" | "address">): boolean {
  const nameA = compactPlaceName(a.name);
  const nameB = compactPlaceName(b.name);
  if (nameA && nameB && (nameA.includes(nameB) || nameB.includes(nameA))) {
    return true;
  }
  const addressA = normalizeText(a.address);
  const addressB = normalizeText(b.address);
  return Boolean(addressA && addressB && addressA === addressB);
}
