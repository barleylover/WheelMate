import { loadPublicEvidenceCsv } from "./fileLoaderUtils.js";

export async function loadKtoBarrierFreeTravelData(): Promise<number> {
  return loadPublicEvidenceCsv({
    filename: "kto_barrier_free_travel.csv",
    source: "한국관광공사 무장애 여행 정보",
    sourceFamily: "culture_fallback",
    evidenceType: "barrier_free_travel",
    nameFields: ["title", "관광지명", "시설명", "콘텐츠명"],
    addressFields: ["addr1", "주소", "기본주소"],
    latFields: ["mapy", "위도"],
    lngFields: ["mapx", "경도"],
    detailFields: ["parking", "route", "publictransport", "elevator", "restroom", "관광약자 편의시설"],
    defaultDetail: "무장애 여행 정보에 등재된 시설입니다."
  });
}
