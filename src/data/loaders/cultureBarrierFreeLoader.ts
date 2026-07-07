import { loadPublicEvidenceCsv } from "./fileLoaderUtils.js";

export async function loadCultureBarrierFreeData(): Promise<number> {
  return loadPublicEvidenceCsv({
    filename: "culture_barrier_free.csv",
    source: "장애인 베리어프리 문화생활 정보",
    sourceFamily: "culture_fallback",
    evidenceType: "culture_barrier_free",
    nameFields: ["시설명", "공연장명", "전시장명", "문화시설명", "name"],
    addressFields: ["주소", "도로명주소", "소재지도로명주소"],
    latFields: ["위도", "lat"],
    lngFields: ["경도", "lng", "lot"],
    detailFields: ["편의정보", "장애인편의시설", "상세정보"],
    defaultDetail: "베리어프리 문화생활 정보에 등재된 시설입니다."
  });
}
