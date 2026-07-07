import { loadPublicEvidenceCsv } from "./fileLoaderUtils.js";

export async function loadBfKeadData(): Promise<number> {
  return loadPublicEvidenceCsv({
    filename: "bf_kead.csv",
    source: "한국장애인고용공단 BF 인증 시설 정보",
    sourceFamily: "bf_certification",
    evidenceType: "bf_certified",
    nameFields: ["지역(시설)명", "시설명", "인증대상"],
    addressFields: ["주소", "소재지", "시군구"],
    detailFields: ["인증구분", "인증등급", "용도구분"],
    defaultDetail: "장애물 없는 생활환경(BF) 인증 시설로 확인되었습니다."
  });
}
