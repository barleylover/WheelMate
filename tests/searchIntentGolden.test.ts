import { describe, expect, it } from "vitest";
import { resolveSearchIntent } from "../src/search/intentResolver.js";

const defaults = { defaultRadiusM: 1000, defaultLimit: 5 };

const GOLDEN_CASES = [
  ["잠실역 근처 휠체어 접근성 좋은 카페 찾아줘", "잠실역", "cafe", []],
  ["휠체어 타고 갈건데 부산 서면역 근처 음식점 추천해줘", "부산 서면역", "restaurant", []],
  ["제주도 횟집 휠체어 타고 가기 편한 곳 추천해줘", "제주도", "restaurant", ["횟집", "회", "생선회"]],
  ["서울 강남 오마카세 맛집 휠체어 접근 가능", "서울 강남", "restaurant", ["오마카세"]],
  ["강남 딤섬 맛집 휠체어 가능", "강남", "restaurant", ["딤섬"]],
  ["인천 주안 수제버거 휠체어 타고 갈만한 곳", "인천 주안", "restaurant", ["수제버거"]],
  ["연남동 비건 브런치 휠체어로 갈 수 있는 곳", "연남동", "cafe", ["비건", "채식", "브런치"]],
  ["서울숲 반려동물 동반 카페 휠체어 가능", "서울숲", "cafe", ["반려동물동반카페"]],
  ["제주공항 근처 베이커리 휠체어", "제주공항", "cafe", ["베이커리", "빵집"]],
  ["을지로 루프탑 술집 휠체어 괜찮은 데", "을지로", "restaurant", ["루프탑술집"]],
  ["대학로 연극 휠체어 좌석", "대학로", "culture", ["연극"]],
  ["여의도 IFC몰 디저트카페 휠체어 접근", "여의도 IFC몰", "cafe", ["디저트"]],
  ["판교 현대백화점 유모차랑 휠체어 가능한 카페", "판교 현대백화점", "cafe", []],
  ["인사동 전통찻집 휠체어 접근 가능한 곳", "인사동", "cafe", ["전통찻집"]],
  ["서울대입구역 돈까스 휠체어 가능", "서울대입구역", "restaurant", ["돈까스", "돈가스"]],
  ["수원 행궁동 파스타 말고 쌀국수 휠체어", "수원 행궁동", "restaurant", ["쌀국수", "베트남"]],
  ["홍대입구역 카페 말고 조용한 서점 휠체어", "홍대입구역", "any", ["서점"]],
  ["제주 국제 공항 근처 카페 휠체어", "제주 국제 공항", "cafe", []],
  ["전주 한옥 마을 카페 휠체어 가능", "전주 한옥 마을", "cafe", []],
  ["강릉 중앙시장 음식점 휠체어", "강릉 중앙시장", "restaurant", []],
  ["경주 황리단길 카페 휠체어", "경주 황리단길", "cafe", []],
  ["해운대 해수욕장 근처 카페 휠체어", "해운대 해수욕장", "cafe", []],
  ["대구 동성로 마라탕 휠체어 가능", "대구 동성로", "restaurant", ["마라탕"]],
  ["광주 충장로 영화관 휠체어", "광주 충장로", "culture", ["영화관"]],
  ["대전 둔산동 미술관 휠체어", "대전 둔산동", "museum", ["미술관"]],
  ["부평역 장애인 화장실 찾아줘", "부평역", "restroom", []],
  ["신촌역 전동휠체어 충전기", "신촌역", "charger", []],
  ["성수동 베이커리 추천 휠체어", "성수동", "cafe", ["베이커리", "빵집"]],
  ["사당역 햄버거집 휠체어 출입", "사당역", "restaurant", ["햄버거", "버거"]],
  ["제주시 초밥집 휠체어", "제주시", "restaurant", ["초밥", "스시"]]
] as const;

describe("search intent golden corpus", () => {
  it.each(GOLDEN_CASES)("parses %s", (query, location, category, content) => {
    const intent = resolveSearchIntent({ query }, defaults);
    expect(intent.location).toBe(location);
    expect(intent.category).toBe(category);
    expect(intent.contentPreferences).toEqual(content);
  });

  it("is stable under common polite and punctuation variants", () => {
    const core = "잠실역 휠체어 접근 가능한 카페";
    const variants = [
      core,
      `${core} 찾아줘`,
      `혹시 ${core} 추천해줄래?`,
      `${core}, 부탁해요!`,
      `휠체어 타고 갈 거야. ${core}`
    ];

    for (const query of variants) {
      const intent = resolveSearchIntent({ query }, defaults);
      expect(intent.location).toBe("잠실역");
      expect(intent.category).toBe("cafe");
      expect(intent.contentPreferences).toEqual([]);
    }
  });

  it("keeps structured location authoritative without turning query location into food", () => {
    const intent = resolveSearchIntent({
      query: "잠실역 근처 휠체어 접근성 좋은 카페",
      location: "서울 전체",
      category: "cafe",
      radius_m: 800
    }, defaults);

    expect(intent.location).toBe("서울");
    expect(intent.scope).toBe("region");
    expect(intent.radiusM).toBe(20_000);
    expect(intent.contentPreferences).toEqual([]);
    expect(intent.warnings).toContain("structured_location_overrode_query_location");
  });

  it("marks inferred content as soft and explicit preferences as hard", () => {
    const inferred = resolveSearchIntent({ query: "제주도 횟집 휠체어" }, defaults);
    const explicit = resolveSearchIntent({
      location: "제주도",
      category: "restaurant",
      preferences: ["횟집"]
    }, defaults);

    expect(inferred.contentTermSource).toBe("query");
    expect(inferred.hardContentFilter).toBe(false);
    expect(explicit.contentTermSource).toBe("explicit");
    expect(explicit.hardContentFilter).toBe(true);
  });
});
