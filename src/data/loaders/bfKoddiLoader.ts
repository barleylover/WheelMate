import { loadPublicEvidenceCsv } from "./fileLoaderUtils.js";

export async function loadBfKoddiData(): Promise<number> {
  return loadPublicEvidenceCsv({
    filename: "bf_koddi.csv",
    source: "한국장애인개발원 장애물없는생활환경인증 정보",
    sourceFamily: "bf_certification",
    evidenceType: "bf_certified",
    nameFields: ["시설명", "지역(시설)명", "인증대상"],
    addressFields: ["주소", "소재지", "시군구"],
    detailFields: ["인증구분", "인증등급", "용도구분"],
    defaultDetail: "장애물없는생활환경 인증 정보가 확인되었습니다."
  });
}
