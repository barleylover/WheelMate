import { loadSupportFacilityCsv } from "./fileLoaderUtils.js";

export async function loadWheelchairChargerData(): Promise<number> {
  return loadSupportFacilityCsv({
    filename: "wheelchair_chargers.csv",
    type: "wheelchair_charger",
    source: "전국전동휠체어급속충전기표준데이터",
    nameFields: ["시설명", "충전소명", "설치장소명"],
    addressFields: ["소재지도로명주소", "소재지지번주소", "주소", "도로명주소"],
    latFields: ["위도", "WGS84위도", "lat"],
    lngFields: ["경도", "WGS84경도", "lng", "lot"],
    openingHourFields: ["평일운영시작시각", "운영시간"],
    phoneFields: ["관리기관전화번호", "전화번호"]
  });
}
