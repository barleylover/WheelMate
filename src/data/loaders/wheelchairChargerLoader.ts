import { hasPositiveNumericField, loadSupportFacilityCsv } from "./fileLoaderUtils.js";

function hours(row: Record<string, string>): string | undefined {
  const ranges = [
    ["평일", row["평일운영시작시각"], row["평일운영종료시각"]],
    ["토요일", row["토요일운영시작시각"], row["토요일운영종료시각"]],
    ["공휴일", row["공휴일운영시작시각"], row["공휴일운영종료시각"]]
  ]
    .filter(([, start, end]) => start || end)
    .map(([label, start, end]) => `${label} ${start || "?"}-${end || "?"}`);
  return ranges.length > 0 ? ranges.join(", ") : undefined;
}

export async function loadWheelchairChargerData(): Promise<number> {
  return loadSupportFacilityCsv({
    filename: "wheelchair_chargers.csv",
    type: "wheelchair_charger",
    source: "전국전동휠체어급속충전기표준데이터",
    nameFields: ["시설명", "충전소명", "설치장소명"],
    addressFields: ["소재지도로명주소", "소재지지번주소", "주소", "도로명주소"],
    latFields: ["위도", "WGS84위도", "lat"],
    lngFields: ["경도", "WGS84경도", "lng", "lot"],
    includeRow: (row) => hasPositiveNumericField(row, ["동시사용가능대수"]),
    openingHoursFromRow: hours,
    metadataFromRow: (row) => ({
      simultaneous_capacity: row["동시사용가능대수"],
      installation_location: row["설치장소설명"],
      air_pump_available: row["공기주입가능여부"],
      mobile_charging_available: row["휴대전화충전가능여부"],
      data_reference_date: row["데이터기준일자"]
    }),
    openingHourFields: ["평일운영시작시각", "운영시간"],
    phoneFields: ["관리기관전화번호", "전화번호"]
  });
}
