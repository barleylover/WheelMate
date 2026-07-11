import type { AppConfig } from "../../config.js";
import { KakaoLocalClient } from "../../clients/kakaoLocalClient.js";
import { PublicDataClient } from "../../clients/publicDataClient.js";
import { clampInteger, MAX_RADIUS_M, MAX_REVIEW_RESULT_LIMIT, MIN_RADIUS_M } from "../../core/inputLimits.js";
import { RequestBudget } from "../../utils/requestBudget.js";

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
  const budget = new RequestBudget(Math.min(3, config.maxExternalApiCallsPerRequest));
  const kakaoLocal = new KakaoLocalClient(config, budget);
  const publicData = new PublicDataClient(config);
  const origin = await kakaoLocal.resolveLocation(input.location);
  const facilities = publicData.findNearbySupportFacilities(
    origin,
    input.type ?? "all",
    clampInteger(input.radius_m, config.defaultRadiusM, MIN_RADIUS_M, MAX_RADIUS_M),
    clampInteger(input.limit, config.defaultLimit, 1, MAX_REVIEW_RESULT_LIMIT),
    origin.address
  );
  return {
    origin,
    facilities,
    request_budget: budget.snapshot(),
    data_caution: "공공데이터 미등재는 실제 시설 부재를 의미하지 않으며, 주소 기반 후보는 정확한 거리가 확인되지 않습니다."
  };
}
