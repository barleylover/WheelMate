import { describe, expect, it } from "vitest";
import { resolveSearchIntent } from "../src/search/intentResolver.js";
import { administrativeCenterQuery } from "../src/search/locationScope.js";

const defaults = { defaultRadiusM: 1000, defaultLimit: 5 };

interface IntentCase {
  query: string;
  location: string;
  category: string;
  content?: string[];
  preferences?: string[];
}

const CASES: IntentCase[] = [
  // Particles, proximity suffixes, spacing, and polite forms.
  { query: "잠실역은 휠체어로 갈 수 있는 카페가 어디야?", location: "잠실역", category: "cafe", content: [] },
  { query: "홍대에서는 전동휠체어 가능한 음식점 알려줘", location: "홍대", category: "restaurant", content: [] },
  { query: "제주도엔 휠체어 접근 가능한 횟집 있어?", location: "제주도", category: "restaurant", content: ["횟집", "회", "생선회"] },
  { query: "부산으로는 휠체어 타고 갈 카페 추천해줘", location: "부산", category: "cafe", content: [] },
  { query: "강남역근처 휠체어 가능한 밥집", location: "강남역", category: "restaurant", content: [] },
  { query: "서면역쪽에 계단 없는 식당 있나요", location: "서면역", category: "restaurant", content: [], preferences: ["계단회피"] },
  { query: "공덕 휠체어 카페 좀 알려줄래", location: "공덕", category: "cafe", content: [] },
  { query: "광화문에서 휠체어로 갈 레스토랑 부탁드립니다", location: "광화문", category: "restaurant", content: [] },
  { query: "문래 주변 유모차랑 휠체어 가능한 카페", location: "문래", category: "cafe", content: [] },
  { query: "잠실새내 휠체어 음식점", location: "잠실새내", category: "restaurant", content: [] },
  { query: "마곡나루 근처 휠체어 카페", location: "마곡나루", category: "cafe", content: [] },
  { query: "오송에서 휠체어 식당 찾아줘", location: "오송", category: "restaurant", content: [] },
  { query: "서울 고속버스터미널 근처 휠체어 음식점", location: "서울 고속버스터미널", category: "restaurant", content: [] },
  { query: "전주 한옥마을에서 휠체어 카페", location: "전주 한옥마을", category: "cafe", content: [] },
  { query: "대전 유성구 휠체어 레스토랑", location: "대전 유성구", category: "restaurant", content: [] },

  // Region plus previously unseen local-area tokens.
  { query: "제주 애월 휠체어 카페", location: "제주 애월", category: "cafe", content: [] },
  { query: "부산 광안리 휠체어 횟집", location: "부산 광안리", category: "restaurant", content: ["횟집", "회", "생선회"] },
  { query: "대구 수성못 휠체어 카페", location: "대구 수성못", category: "cafe", content: [] },
  { query: "서울 북촌 휠체어 전통찻집", location: "서울 북촌", category: "cafe", content: ["전통찻집"] },
  { query: "인천 송도 휠체어 레스토랑", location: "인천 송도", category: "restaurant", content: [] },

  // Accessibility facilities must become preferences when a venue is the target.
  { query: "강남역 장애인 화장실 있는 카페 추천", location: "강남역", category: "cafe", content: [], preferences: ["장애인화장실"] },
  { query: "강남역 근처 장애인 화장실 찾아줘", location: "강남역", category: "restroom", content: [] },
  { query: "사당역 전동휠체어 충전기 근처 식당", location: "사당역", category: "restaurant", content: [], preferences: ["충전기근처"] },
  { query: "사당역 전동휠체어 충전기 찾아줘", location: "사당역", category: "charger", content: [] },
  { query: "신촌역 엘리베이터 있는 카페", location: "신촌역", category: "cafe", content: [], preferences: ["엘리베이터"] },
  { query: "건대입구역 계단 없는 음식점", location: "건대입구역", category: "restaurant", content: [], preferences: ["계단회피"] },
  { query: "성수동 문턱 없는 카페", location: "성수동", category: "cafe", content: [], preferences: ["입구중요"] },
  { query: "종로 경사로 있는 식당", location: "종로", category: "restaurant", content: [], preferences: ["입구중요"] },
  { query: "서울역 전동휠체어 충전기 가까운 카페", location: "서울역", category: "cafe", content: [], preferences: ["충전기근처"] },

  // Natural descriptions of mobility needs must not become food/place filters.
  { query: "다리가 불편한 아버지와 강남역 식당 가려고 해", location: "강남역", category: "restaurant", content: [] },
  { query: "보행이 어려운 어머니 모시고 잠실역 카페", location: "잠실역", category: "cafe", content: [] },
  { query: "이동약자랑 광화문 음식점 갈 건데", location: "광화문", category: "restaurant", content: [] },
  { query: "유모차와 휠체어로 성수동 카페 갈 거야", location: "성수동", category: "cafe", content: [] },
  { query: "계단을 피해야 해서 대학로 공연장 찾는 중", location: "대학로", category: "culture", content: ["공연장"], preferences: ["계단회피"] },

  // Category vocabulary that ordinary users use instead of schema enum words.
  { query: "부산역 휠체어 레스토랑", location: "부산역", category: "restaurant", content: [] },
  { query: "해운대 휠체어 베이글 가게", location: "해운대", category: "cafe", content: ["베이글"] },
  { query: "신림역 휠체어 밥집", location: "신림역", category: "restaurant", content: [] },
  { query: "여의도 휠체어로 점심 먹을 곳", location: "여의도", category: "restaurant", content: [] },
  { query: "홍대 휠체어 펍", location: "홍대", category: "restaurant", content: ["펍"] },
  { query: "이태원 휠체어 가능한 바", location: "이태원", category: "restaurant", content: ["바"] },
  { query: "신촌 휠체어 극장", location: "신촌", category: "culture", content: ["극장"] },
  { query: "성수 휠체어 전시 공간", location: "성수", category: "culture", content: ["전시"] },
  { query: "대전 휠체어 갤러리", location: "대전", category: "museum", content: ["갤러리"] },
  { query: "잠실 역 근처 휠 체어 가능한 까페", location: "잠실역", category: "cafe", content: [] },

  // Exclusions and corrections: the last stated target wins, but old location remains when omitted.
  { query: "강남 말고 홍대입구역 휠체어 카페", location: "홍대입구역", category: "cafe", content: [] },
  { query: "서울 말고 부산 서면역 휠체어 식당", location: "부산 서면역", category: "restaurant", content: [] },
  { query: "잠실역 카페 말고 휠체어 음식점", location: "잠실역", category: "restaurant", content: [] },
  { query: "강남역 초밥 말고 휠체어 파스타", location: "강남역", category: "restaurant", content: ["파스타"] },
  { query: "서울이 아니라 부산 해운대 휠체어 카페", location: "부산 해운대", category: "cafe", content: [] },
  { query: "식당 대신 성수동 휠체어 카페", location: "성수동", category: "cafe", content: [] },
  { query: "홍대 카페는 싫고 합정역 휠체어 식당", location: "합정역", category: "restaurant", content: [] },
  { query: "강남역 엘리베이터 말고 경사로 있는 카페", location: "강남역", category: "cafe", content: [], preferences: ["입구중요"] },
  { query: "잠실역 엘리베이터 없는 카페", location: "잠실역", category: "cafe", content: [], preferences: [] },
  { query: "잠실역 장애인 화장실 없는 카페", location: "잠실역", category: "cafe", content: [], preferences: [] },
  { query: "사당역 전동휠체어 충전기 필요 없는 식당", location: "사당역", category: "restaurant", content: [], preferences: [] },

  // Concrete content terms and free-form requirements.
  { query: "마곡나루역 휠체어 비건 샐러드", location: "마곡나루역", category: "restaurant", content: ["비건", "채식", "샐러드"] },
  { query: "성수동 휠체어 베이글 카페", location: "성수동", category: "cafe", content: ["베이글"] },
  { query: "을지로 휠체어 수제버거집", location: "을지로", category: "restaurant", content: ["수제버거"] },
  { query: "종각역 휠체어 딤섬", location: "종각역", category: "restaurant", content: ["딤섬"] },
  { query: "이태원 휠체어 할랄 식당", location: "이태원", category: "restaurant", content: ["할랄"] },
  { query: "홍대입구역 24시간 휠체어 카페", location: "홍대입구역", category: "cafe", content: ["24시간"] },
  { query: "강남역 글루텐프리 휠체어 베이커리", location: "강남역", category: "cafe", content: ["글루텐프리", "베이커리", "빵집"] },
  { query: "합정역 콘센트 많은 휠체어 카페", location: "합정역", category: "cafe", content: ["콘센트"] },

  // Markup, emoji, and excessive spacing must not corrupt the core intent.
  { query: "<script>alert(1)</script>  잠실역   휠체어 카페 ☕", location: "잠실역", category: "cafe", content: [] },
  { query: "♿ 부산   서면역, 음식점 추천해주세요!!!", location: "부산 서면역", category: "restaurant", content: [] },
  { query: "부산 카페를 찾고 있어", location: "부산", category: "cafe", content: [] }
];

describe("mass search-intent QA corpus", () => {
  it.each(CASES)("parses: $query", (testCase) => {
    const intent = resolveSearchIntent({ query: testCase.query }, defaults);
    expect(intent.location).toBe(testCase.location);
    expect(intent.category).toBe(testCase.category);
    if (testCase.content) expect(intent.contentPreferences).toEqual(testCase.content);
    if (testCase.preferences) expect(intent.preferences).toEqual(testCase.preferences);
  });

  it("is metamorphically stable under common conversational wrappers", () => {
    const stableCases = CASES.filter((item) => (item.content?.length ?? 0) === 0).slice(0, 30);
    const wrappers = [
      (query: string) => query,
      (query: string) => `혹시 ${query}?`,
      (query: string) => `${query}, 부탁해요!`,
      (query: string) => `안녕하세요. ${query} 알려줄래요?`
    ];
    for (const testCase of stableCases) {
      for (const wrap of wrappers) {
        const intent = resolveSearchIntent({ query: wrap(testCase.query) }, defaults);
        expect(intent.location, wrap(testCase.query)).toBe(testCase.location);
        expect(intent.category, wrap(testCase.query)).toBe(testCase.category);
      }
    }
  });

  it("passes a 672-query combinatorial conversational matrix", () => {
    const locations = [
      ["잠실역에서", "잠실역"],
      ["홍대에서는", "홍대"],
      ["강남역근처", "강남역"],
      ["서면역쪽에", "서면역"],
      ["광화문에서", "광화문"],
      ["제주 애월", "제주 애월"],
      ["부산 광안리", "부산 광안리"],
      ["대구 수성못", "대구 수성못"]
    ] as const;
    const categories = [
      ["카페", "cafe"],
      ["음식점", "restaurant"],
      ["레스토랑", "restaurant"],
      ["밥집", "restaurant"],
      ["극장", "culture"],
      ["갤러리", "museum"],
      ["장애인 화장실", "restroom"]
    ] as const;
    const mobilityPhrases = [
      "휠체어로 갈 수 있는",
      "전동휠체어 이용 가능한",
      "유모차와 휠체어 가능한",
      "계단 없는"
    ];
    const wrappers = [
      (query: string) => query,
      (query: string) => `혹시 ${query} 추천해줘`,
      (query: string) => `${query}, 알려줄래요?`
    ];

    let executed = 0;
    for (const [locationText, expectedLocation] of locations) {
      for (const [categoryText, expectedCategory] of categories) {
        for (const mobility of mobilityPhrases) {
          for (const wrap of wrappers) {
            const query = wrap(`${locationText} ${mobility} ${categoryText}`);
            const intent = resolveSearchIntent({ query }, defaults);
            expect(intent.location, query).toBe(expectedLocation);
            expect(intent.category, query).toBe(expectedCategory);
            expect(intent.contentPreferences, query).not.toEqual(
              expect.arrayContaining(["계단없는", "휠체어", "전동휠체어", "유모차"])
            );
            executed += 1;
          }
        }
      }
    }
    expect(executed).toBe(672);
  });

  it.each([
    ["서울 전체 주변", "서울"],
    ["서울 전역에서", "서울"],
    ["부산 전 지역 근처", "부산"],
    ["제주도 일대 주변", "제주도"]
  ])("normalizes nested region scope: %s", (location, expected) => {
    const intent = resolveSearchIntent({ location, category: "cafe" }, defaults);
    expect(intent.location).toBe(expected);
    expect(intent.scope).toBe("region");
    expect(intent.radiusM).toBe(20_000);
  });

  it("rejects a query with no inferable location instead of inventing one", () => {
    expect(() => resolveSearchIntent({ query: "휠체어 가능한 카페 추천해줘" }, defaults))
      .toThrow("location is required or must be inferable from query");
  });

  it("uses a canonical landmark for a nationally ambiguous colloquial area", () => {
    expect(administrativeCenterQuery("대학로")).toBe("혜화역");
    expect(administrativeCenterQuery("경북 구미시 대학로")).toBe("경북 구미시 대학로");
  });
});
