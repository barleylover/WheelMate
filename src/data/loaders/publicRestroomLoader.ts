import { hasPositiveNumericField, loadSupportFacilityCsv } from "./fileLoaderUtils.js";

export async function loadPublicRestroomData(): Promise<number> {
  return loadSupportFacilityCsv({
    filename: "public_restrooms.csv",
    type: "accessible_restroom",
    source: "전국공중화장실표준데이터",
    nameFields: ["화장실명", "공중화장실명", "명칭"],
    addressFields: ["소재지도로명주소", "소재지지번주소", "주소", "도로명주소"],
    latFields: ["WGS84위도", "위도", "lat"],
    lngFields: ["WGS84경도", "경도", "lng", "lot"],
    includeRow: (row) =>
      hasPositiveNumericField(row, [
        "남성용-장애인용대변기수",
        "남성용-장애인용소변기수",
        "여성용-장애인용대변기수"
      ]),
    metadataFromRow: (row) => ({
      male_accessible_toilets: row["남성용-장애인용대변기수"],
      male_accessible_urinals: row["남성용-장애인용소변기수"],
      female_accessible_toilets: row["여성용-장애인용대변기수"],
      data_reference_date: row["데이터기준일자"],
      last_modified_at: row["최종수정시점"]
    }),
    openingHourFields: ["개방시간상세", "개방시간", "운영시간"],
    phoneFields: ["관리기관전화번호", "전화번호"]
  });
}
