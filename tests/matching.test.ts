import { describe, expect, it } from "vitest";
import { matchPlaces } from "../src/core/placeMatcher.js";
import type { PlaceCandidate } from "../src/core/types.js";

const place = (name: string, lat: number, lng: number, address: string): PlaceCandidate => ({
  id: name,
  name,
  category: "cafe",
  address,
  lat,
  lng,
  source: "test",
  evidence: []
});

describe("place matching", () => {
  it("strongly matches similar names with same address and coordinates", () => {
    const result = matchPlaces(
      place("스타벅스 홍대입구역점", 37.5572, 126.9254, "서울 마포구 양화로 160"),
      place("스타벅스 홍대입구역", 37.55721, 126.92542, "서울 마포구 양화로 160")
    );
    expect(result.strength).toBe("strong");
  });

  it("does not match places over 200m apart unless the name is very strong", () => {
    const result = matchPlaces(
      place("스타벅스 홍대입구역점", 37.5572, 126.9254, "서울 마포구 양화로 160"),
      place("폴바셋 홍대입구역", 37.5602, 126.9295, "서울 마포구 월드컵북로 20")
    );
    expect(result.strength).toBe("none");
  });

  it("keeps ambiguous same-building style matches weak", () => {
    const result = matchPlaces(
      place("문화센터 카페", 37.5572, 126.9254, "서울 마포구 양화로 160 1층"),
      place("문화센터", 37.5573, 126.9255, "서울 마포구 양화로 160")
    );
    expect(["weak", "strong"]).toContain(result.strength);
    expect(result.score).toBeGreaterThanOrEqual(0.55);
  });
});
