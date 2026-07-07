import { loadPublicEvidenceCsv } from "./fileLoaderUtils.js";

export async function loadGyeonggiSharedDisabilityFacilitiesData(): Promise<number> {
  return loadPublicEvidenceCsv({
    filename: "gyeonggi_shared_disability_facilities.csv",
    source: "경기도 경기공유 장애인시설",
    sourceFamily: "disability_facility",
    evidenceType: "disability_facility",
    nameFields: ["시설명", "기관명", "name"],
    addressFields: ["주소", "도로명주소", "소재지도로명주소"],
    latFields: ["위도", "lat"],
    lngFields: ["경도", "lng", "lot"],
    detailFields: ["편의시설", "시설종류", "상세정보"],
    defaultDetail: "경기도 장애인시설 데이터에 등재된 시설입니다."
  });
}
