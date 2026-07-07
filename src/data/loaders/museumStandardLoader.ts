import { loadPublicEvidenceCsv } from "./fileLoaderUtils.js";

export async function loadMuseumStandardData(): Promise<number> {
  return loadPublicEvidenceCsv({
    filename: "museum_standard.csv",
    source: "전국박물관미술관정보표준데이터",
    sourceFamily: "culture_fallback",
    evidenceType: "museum_accessibility",
    nameFields: ["시설명", "박물관미술관명", "명칭"],
    addressFields: ["소재지도로명주소", "소재지지번주소", "주소", "도로명주소"],
    latFields: ["위도", "WGS84위도"],
    lngFields: ["경도", "WGS84경도"],
    detailFields: ["편의시설정보", "장애인편의시설", "기타편의시설"],
    defaultDetail: "박물관/미술관 표준데이터에 등재된 시설입니다."
  });
}
