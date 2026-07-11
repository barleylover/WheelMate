import { describe, expect, it } from "vitest";
import {
  assessPlaceRelevance,
  placeEvidenceIsAttributable,
  placeEvidenceIsRecommendationSafe,
  type PlaceRelevanceContext
} from "../src/reviewSearch/placeRelevance.js";
import { extractSignals, extractSignalsFromText } from "../src/reviewSearch/signalExtractor.js";
import type { ReviewSignal } from "../src/types.js";

function recommendationPositive(signals: ReviewSignal[]): boolean {
  return signals.some((signal) =>
    signal.polarity === "positive" &&
    (!signal.subject || signal.subject === "venue") &&
    !["basement_or_floor", "stroller_proxy", "unknown"].includes(signal.type)
  );
}

const context = (placeName: string, neighborhood?: string): PlaceRelevanceContext => ({
  placeName,
  neighborhood,
  district: neighborhood?.includes("부산") ? "부산진구" : "송파구",
  category: "카페"
});

describe("mass accessibility-signal QA", () => {
  it.each([
    "매장 휠체어 출입 가능",
    "전동휠체어 이용 가능",
    "가게 옆문으로 휠체어 방문 가능한 곳",
    "주 출입구 문턱 없음",
    "매장 입구에 단차 없는 여닫이문",
    "카페 입구에 계단이 없음",
    "매장 앞 경사로가 설치되어 있음",
    "입구에 슬로프가 있어요",
    "매장 안 장애인 화장실이 있음",
    "건물에 엘리베이터가 있어 이용 가능",
    "입구가 넓고 자동문",
    "매장 통로가 넓음",
    "배리어프리 카페입니다",
    "무장애 식당으로 운영됩니다",
    "휠체어 출입 이 가능함"
  ])("keeps venue-positive wording: %s", (text) => {
    expect(recommendationPositive(extractSignalsFromText(text))).toBe(true);
  });

  it.each([
    "휠체어 출입 불가",
    "휠체어 이용 가능하지 않습니다",
    "휠체어 지하철 접근 가능",
    "지하철역 엘리베이터가 있어요",
    "근처 장애인 화장실이 있음",
    "계단으로만 올라가야 합니다",
    "경사로가 없음",
    "문턱이 높음",
    "입구가 좁음",
    "매장은 1층에 있어요",
    "유모차 이용 가능",
    "이 카페는 배리어프리 시설이 아닙니다",
    "휠체어 지하철 접근 가능하지만 매장은 계단뿐",
    "장애인 주차는 불가",
    "역에서 가까워 접근성이 좋은 카페"
  ])("does not promote unsafe or proxy wording: %s", (text) => {
    expect(recommendationPositive(extractSignalsFromText(text))).toBe(false);
  });
});

describe("mass place-to-evidence attribution QA", () => {
  it.each([
    {
      name: "single venue title with snippet evidence",
      place: "투썸플레이스 잠실역점",
      neighborhood: "잠실역",
      title: "투썸플레이스 잠실역점 방문 후기",
      snippet: "매장 휠체어 출입 가능",
      expected: true
    },
    {
      name: "venue in snippet next to signal",
      place: "소낙",
      title: "서울 카페 세 곳",
      snippet: "아늑한 카페 소낙입니다. 소낙 주 출입구는 단차 없는 문입니다",
      expected: true
    },
    {
      name: "another venue cannot borrow evidence",
      place: "떼루와 잠실역점",
      neighborhood: "잠실역",
      title: "투썸플레이스 잠실역점",
      snippet: "매장 휠체어 출입 가능",
      expected: false
    },
    {
      name: "branch collision cannot borrow evidence",
      place: "던킨 서면역점",
      neighborhood: "부산 서면역",
      title: "넘버25 서면역점",
      snippet: "휠체어 출입 가능",
      expected: false
    },
    {
      name: "brand landmark alias cannot borrow another venue's evidence",
      place: "메가MGC커피 강남역신분당선점",
      neighborhood: "강남역",
      title: "강남역 미용실 비엠헤어다이스 2호점",
      snippet: "메가 MGC 커피 근처 미용실이며 휠체어 출입이 가능하여 편리했어요",
      expected: false
    },
    {
      name: "area alias cannot identify one of several same-area venues",
      place: "광안리 통영횟집",
      neighborhood: "부산 광안리",
      title: "부산 광안리 조개구이 맛집 후기",
      snippet: "좌석 휠체어 이용 가능",
      expected: false
    },
    {
      name: "title snippet boundary cannot invent venue",
      place: "카페오늘은",
      title: "서울 휠체어 출입 가능 카페",
      snippet: "오늘은 아이와 갈 장소를 소개합니다",
      expected: false
    },
    {
      name: "multi venue title does not lend snippet evidence",
      place: "적당",
      title: "카페 적당 포함 서울 카페 3곳",
      snippet: "카페 소낙의 주 출입구는 단차 없는 문입니다",
      expected: false
    },
    {
      name: "multiple quoted venues keep accessibility signals in their own segment",
      place: "카페 슬로우",
      neighborhood: "강남역",
      title: "강남역 \"인더비엣\", \"타짜도르\", \"카페 슬로우\" 방문",
      snippet: "타짜도르는 와이파이와 경사로 있음 & 카페 슬로우는 새벽까지 영업",
      expected: false
    },
    {
      name: "short common noun is not a restaurant entity",
      place: "원담",
      title: "제주 해변 여행",
      snippet: "휠체어 접근 가능하며 간조에는 전통 어로시설인 원담의 모습이 보입니다",
      expected: false
    },
    {
      name: "course menu is not a multi venue roundup",
      place: "마지막해녀",
      title: "제주시 횟집 마지막해녀 코스요리 후기",
      snippet: "가게 옆문으로 휠체어 방문 가능",
      expected: true
    },
    {
      name: "transit statement is not venue evidence",
      place: "A카페",
      neighborhood: "잠실역",
      title: "A카페 잠실역 방문",
      snippet: "휠체어 지하철 접근 가능",
      expected: false
    },
    {
      name: "negated venue statement is not positive evidence",
      place: "B카페",
      title: "B카페 후기",
      snippet: "휠체어 이용 가능하지 않습니다",
      expected: false
    }
  ])("checks $name", ({ place, neighborhood, title, snippet, expected }) => {
    const result = { title, snippet };
    const assessment = assessPlaceRelevance(result, context(place, neighborhood));
    const signals = extractSignals({ ...result, source: "naver_blog", link: "", date: null });
    const accepted = placeEvidenceIsRecommendationSafe(result, assessment, signals);
    expect(accepted).toBe(expected);
  });

  it("rejects a named venue when the only positive phrase is too far away in a roundup snippet", () => {
    const filler = "다른 장소 설명 ".repeat(30);
    const result = {
      title: "서울 카페 모음",
      snippet: `카페 알파를 소개합니다. ${filler}카페 베타는 휠체어 출입 가능`
    };
    const assessment = assessPlaceRelevance(result, context("카페 알파"));
    const signals = extractSignals({ ...result, source: "naver_blog", link: "", date: null });
    expect(placeEvidenceIsAttributable(result, assessment, signals)).toBe(false);
  });
});
