import { loadPublicEvidenceCsv } from "./fileLoaderUtils.js";

export async function loadDisabilityFacilitiesStandardData(): Promise<number> {
  return loadPublicEvidenceCsv({
    filename: "disability_facilities_standard.csv",
    source: "전국장애인편의시설표준데이터",
    sourceFamily: "disability_facility",
    evidenceType: "disability_facility",
    nameFields: ["시설명", "대상시설명", "편의시설명"],
    addressFields: ["소재지도로명주소", "소재지지번주소", "주소", "도로명주소"],
    latFields: ["위도", "WGS84위도"],
    lngFields: ["경도", "WGS84경도"],
    detailFields: ["편의시설종류", "편의시설유형", "시설구분"],
    defaultDetail: "장애인 편의시설 표준데이터에 등재된 시설입니다."
  });
}
