import { describe, expect, it } from "vitest";
import {
  assessPlaceRelevance,
  calculatePlaceRelevance,
  placeEvidenceIsAttributable,
  placeEvidenceIsRecommendationSafe
} from "../src/reviewSearch/placeRelevance.js";
import { extractSignals } from "../src/reviewSearch/signalExtractor.js";

const context = {
  placeName: "A카페",
  neighborhood: "홍대입구",
  district: "마포구",
  addressToken: "양화로",
  category: "카페"
};

describe("calculatePlaceRelevance", () => {
  it("scores place and neighborhood as usable evidence", () => {
    const score = calculatePlaceRelevance(
      { title: "A카페 홍대입구 방문", snippet: "마포구 양화로 카페 휠체어 후기" },
      context
    );
    expect(score).toBeGreaterThanOrEqual(0.65);
  });

  it("keeps neighborhood-only matches weak", () => {
    const score = calculatePlaceRelevance(
      { title: "홍대입구 카페 후기", snippet: "유모차 가능" },
      context
    );
    expect(score).toBeLessThan(0.45);
  });

  it("discards unrelated places", () => {
    const score = calculatePlaceRelevance({ title: "B식당", snippet: "강남역 계단 있음" }, context);
    expect(score).toBe(0);
  });

  it("matches place names despite spacing differences", () => {
    const score = calculatePlaceRelevance(
      { title: "블랑제리 르팡 휠체어 이용 가능", snippet: "사당역 베이커리 카페" },
      { ...context, placeName: "블랑제리르팡", neighborhood: "사당역" }
    );
    expect(score).toBeGreaterThanOrEqual(0.45);
  });

  it("accepts a branch-specific brand spelling variant without accepting brand-only evidence", () => {
    const matching = {
      title: "메가커피 잠실역 지하상가점 방문 후기",
      snippet: "매장 휠체어 출입 가능"
    };
    const matchingAssessment = assessPlaceRelevance(matching, {
      ...context,
      placeName: "메가MGC커피 잠실지하상가점",
      neighborhood: "잠실역"
    });
    const matchingSignals = extractSignals({ ...matching, source: "naver_blog", link: "", date: null });
    expect(matchingAssessment.name_match).toBe("exact");
    expect(placeEvidenceIsRecommendationSafe(matching, matchingAssessment, matchingSignals)).toBe(true);

    const wrongBranch = {
      title: "메가커피 강남역점 방문 후기",
      snippet: "매장 휠체어 출입 가능"
    };
    const wrongAssessment = assessPlaceRelevance(wrongBranch, {
      ...context,
      placeName: "메가MGC커피 잠실지하상가점",
      neighborhood: "잠실역"
    });
    const wrongSignals = extractSignals({ ...wrongBranch, source: "naver_blog", link: "", date: null });
    expect(wrongAssessment.name_match).not.toBe("exact");
    expect(placeEvidenceIsRecommendationSafe(wrongBranch, wrongAssessment, wrongSignals)).toBe(false);
  });

  it("requires the requested area for branch names that can collide nationwide", () => {
    const wrongArea = {
      title: "원주 무실동 카페 스타벅스 시청점 베이커리",
      snippet: "매장 출입구는 휠체어 이용 가능"
    };
    const wrongAssessment = assessPlaceRelevance(wrongArea, {
      ...context,
      placeName: "스타벅스 시청점",
      neighborhood: "서울",
      district: "중구"
    });
    const wrongSignals = extractSignals({ ...wrongArea, source: "naver_blog", link: "", date: null });
    expect(wrongAssessment).toMatchObject({ name_match: "exact", location_required: true, location_match: false });
    expect(placeEvidenceIsRecommendationSafe(wrongArea, wrongAssessment, wrongSignals)).toBe(false);

    const matchingArea = {
      title: "서울 중구 스타벅스 시청점 방문",
      snippet: "매장 출입구는 휠체어 이용 가능"
    };
    const matchingAssessment = assessPlaceRelevance(matchingArea, {
      ...context,
      placeName: "스타벅스 시청점",
      neighborhood: "서울",
      district: "중구"
    });
    const matchingSignals = extractSignals({ ...matchingArea, source: "naver_blog", link: "", date: null });
    expect(matchingAssessment).toMatchObject({ location_required: true, location_match: true });
    expect(placeEvidenceIsRecommendationSafe(matchingArea, matchingAssessment, matchingSignals)).toBe(true);
  });

  it("requires regional corroboration for short venue names", () => {
    const wrongArea = {
      title: "마산가포맛집 황금어장 방문",
      snippet: "입구에 경사로가 있어 휠체어 출입 가능"
    };
    const wrongAssessment = assessPlaceRelevance(wrongArea, {
      ...context,
      placeName: "황금어장",
      neighborhood: "제주도",
      district: "제주시"
    });
    const wrongSignals = extractSignals({ ...wrongArea, source: "naver_blog", link: "", date: null });
    expect(wrongAssessment).toMatchObject({ name_match: "exact", location_required: true, location_match: false });
    expect(placeEvidenceIsRecommendationSafe(wrongArea, wrongAssessment, wrongSignals)).toBe(false);

    const matchingArea = {
      title: "서울 카페 세 곳",
      snippet: "아늑한 카페 소낙입니다. 소낙 주 출입구는 단차 없는 문입니다"
    };
    const matchingAssessment = assessPlaceRelevance(matchingArea, {
      ...context,
      placeName: "소낙",
      neighborhood: "서울"
    });
    const matchingSignals = extractSignals({ ...matchingArea, source: "naver_blog", link: "", date: null });
    expect(matchingAssessment).toMatchObject({ location_required: true, location_match: true });
    expect(placeEvidenceIsRecommendationSafe(matchingArea, matchingAssessment, matchingSignals)).toBe(true);
  });

  it("does not accept only a broad city match when a specific neighborhood was requested", () => {
    const wrongNeighborhood = {
      title: "부산 해운대 카페 봄날 방문",
      snippet: "매장 출입구는 휠체어 이용 가능"
    };
    const assessment = assessPlaceRelevance(wrongNeighborhood, {
      ...context,
      placeName: "봄날",
      neighborhood: "부산 서면역",
      district: "부산진구"
    });
    const signals = extractSignals({ ...wrongNeighborhood, source: "naver_blog", link: "", date: null });
    expect(assessment).toMatchObject({ name_match: "exact", location_required: true, location_match: false });
    expect(placeEvidenceIsRecommendationSafe(wrongNeighborhood, assessment, signals)).toBe(false);
  });

  it("does not confuse a nearby venue with the venue named by the source", () => {
    expect(assessPlaceRelevance(
      { title: "투썸플레이스 잠실역점", snippet: "매장 출입구는 휠체어 이용 가능" },
      { ...context, placeName: "떼루와 잠실역점", neighborhood: "잠실역" }
    ).name_match).toBe("none");
    expect(assessPlaceRelevance(
      { title: "넘버25 서면역점", snippet: "휠체어 출입 가능" },
      { ...context, placeName: "던킨 서면역점", neighborhood: "서면역" }
    ).name_match).toBe("none");
  });

  it("never invents a place name across the title and snippet boundary", () => {
    const assessment = assessPlaceRelevance(
      {
        title: "서울 추천장소 / 휠체어 출입 가능 카페",
        snippet: "오늘은 서울에서 아이와 함께 가기 좋은 장소를 소개합니다"
      },
      { ...context, placeName: "카페오늘은", neighborhood: undefined }
    );

    expect(assessment).toMatchObject({ score: 0, name_match: "none" });
  });

  it("attributes a list snippet to the nearby venue, not another venue named only in the title", () => {
    const result = {
      title: "카페 '적당' 포함 서울 카페 3곳",
      snippet: "아늑한 카페 '소낙'입니다. 소낙의 주 출입구는 단차 없는 문이라 휠체어 이용 가능"
    };
    const signals = extractSignals({ ...result, source: "naver_blog", link: "", date: null });
    const suitable = assessPlaceRelevance(result, { ...context, placeName: "적당" });
    const sonak = assessPlaceRelevance(result, { ...context, placeName: "소낙" });

    expect(placeEvidenceIsAttributable(result, suitable, signals)).toBe(false);
    expect(placeEvidenceIsAttributable(result, sonak, signals)).toBe(true);
  });

  it("does not treat a short common noun in a travel article as a venue entity", () => {
    const result = {
      title: "제주 이호테우해변 여행과 맛집 코스",
      snippet: "휠체어 접근 가능하며 간조에는 전통 어로시설인 원담의 모습도 볼 수 있다"
    };
    expect(assessPlaceRelevance(result, { ...context, placeName: "원담", category: "음식점" }))
      .toMatchObject({ score: 0, name_match: "none" });
  });

  it("does not mistake a restaurant's course-menu wording for a multi-venue roundup", () => {
    const result = {
      title: "제주시 도민 횟집 마지막해녀 코스요리 후기",
      snippet: "가게 옆문을 열어주셔서 휠체어 방문 가능한 제주시 맛집이다"
    };
    const assessment = assessPlaceRelevance(result, { ...context, placeName: "마지막해녀", category: "음식점" });
    const signals = extractSignals({ ...result, source: "naver_blog", link: "", date: null });
    expect(placeEvidenceIsAttributable(result, assessment, signals)).toBe(true);
  });
});
