import type { AppConfig } from "../../config.js";
import { KakaoLocalClient } from "../../clients/kakaoLocalClient.js";
import { PublicDataClient } from "../../clients/publicDataClient.js";

export interface FindNearbySupportFacilitiesInput {
  location: string;
  type: "accessible_restroom" | "wheelchair_charger" | "all";
  radius_m?: number;
  limit?: number;
}

export async function findNearbySupportFacilities(
  input: FindNearbySupportFacilitiesInput,
  config: AppConfig
): Promise<Record<string, unknown>> {
  const kakaoLocal = new KakaoLocalClient(config);
  const publicData = new PublicDataClient(config);
  const origin = await kakaoLocal.resolveLocation(input.location);
  const facilities = publicData.findNearbySupportFacilities(
    origin,
    input.type ?? "all",
    input.radius_m ?? config.defaultRadiusM,
    input.limit ?? config.defaultLimit
  );
  return { origin, facilities };
}
