import { loadPublicEvidenceCsv } from "./fileLoaderUtils.js";

export async function loadSocialSecurityDisabilityFacilitiesData(): Promise<number> {
  return loadPublicEvidenceCsv({
    filename: "social_security_disability_facilities.csv",
    source: "한국사회보장정보원 장애인편의시설 현황",
    sourceFamily: "disability_facility",
    evidenceType: "disability_facility",
    nameFields: ["faclNm", "시설명", "대상시설명"],
    addressFields: ["roadNmAddr", "주소", "시설주소", "도로명주소"],
    latFields: ["lat", "위도", "WGS84위도"],
    lngFields: ["lot", "lng", "경도", "WGS84경도"],
    detailFields: ["evalInfo", "편의시설종류", "기구표목록"],
    defaultDetail: "장애인편의시설 현황 데이터에 등재된 시설입니다."
  });
}
