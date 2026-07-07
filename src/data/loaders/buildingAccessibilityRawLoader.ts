import fs from "node:fs/promises";
import path from "node:path";
import type { BuildingAccessibility } from "../../core/types.js";
import type { LoaderContext, LoaderResult, PublicDataLoader } from "./types.js";

/**
 * 건물·시설 단위 접근성 표준데이터(예: 전국장애인편의시설표준데이터)를 raw 파일에서 적재한다.
 * 공공데이터 CSV/JSON 은 기관마다 컬럼명이 조금씩 달라, 한글 헤더를 키워드로 유연하게 매핑한다.
 *
 * 지원 파일: JSON(UTF-8) 또는 CSV(UTF-8/EUC-KR). data.go.kr 표준데이터의 "그리드" 탭에서
 * JSON 또는 CSV 로 내려받아 data/raw/ 에 두면 된다.
 */
export const createBuildingAccessibilityRawLoader = (params: {
  source: string;
  fileNames: string[];
  /** 파일이 BF 인증 데이터라 개별 편의시설 컬럼이 없어도 매칭 시 BF 인증으로 취급한다. */
  markAllBfCertified?: boolean;
}): PublicDataLoader => ({
  source: params.source,
  async load(context: LoaderContext): Promise<LoaderResult> {
    const filePath = await findFirstExisting(context.rawDir, params.fileNames);
    if (!filePath) {
      return {
        source: params.source,
        status: "skipped",
        loadedCount: 0,
        message: `No raw file found. Expected one of: ${params.fileNames.join(", ")}`
      };
    }

    const rows = await readRows(filePath);
    let loadedCount = 0;
    let skipped = 0;
    for (const row of rows) {
      const record = rowToBuildingAccessibility(row, params.source, params.markAllBfCertified ?? false);
      if (!record) {
        skipped += 1;
        continue;
      }
      context.db.insertBuildingAccessibility(record);
      loadedCount += 1;
    }

    return {
      source: params.source,
      status: loadedCount > 0 ? "loaded" : "skipped",
      loadedCount,
      message: `${path.basename(filePath)} (좌표 없는 ${skipped}건 제외)`
    };
  }
});

const findFirstExisting = async (rawDir: string, fileNames: string[]): Promise<string | undefined> => {
  for (const fileName of fileNames) {
    const filePath = path.join(rawDir, fileName);
    try {
      await fs.access(filePath);
      return filePath;
    } catch {
      // continue
    }
  }
  return undefined;
};

const readRows = async (filePath: string): Promise<Record<string, string>[]> => {
  const buffer = await fs.readFile(filePath);
  const text = decodeBuffer(buffer);
  if (filePath.endsWith(".json")) {
    const parsed = JSON.parse(text) as unknown;
    const list = Array.isArray(parsed)
      ? parsed
      : extractArray(parsed);
    return list.map((item) => stringifyValues(item as Record<string, unknown>));
  }
  if (filePath.endsWith(".csv")) {
    return parseCsv(text);
  }
  return [];
};

/** 공공데이터 JSON 은 배열이거나 {data:[...]} / {response:{body:{items:[...]}}} 형태다. */
const extractArray = (parsed: unknown): unknown[] => {
  if (typeof parsed !== "object" || parsed === null) {
    return [];
  }
  const obj = parsed as Record<string, unknown>;
  if (Array.isArray(obj.data)) {
    return obj.data;
  }
  if (Array.isArray(obj.records)) {
    return obj.records;
  }
  const body = (obj.response as { body?: { items?: unknown } } | undefined)?.body?.items;
  if (Array.isArray(body)) {
    return body;
  }
  if (body && typeof body === "object" && Array.isArray((body as { item?: unknown }).item)) {
    return (body as { item: unknown[] }).item;
  }
  return [];
};

const stringifyValues = (row: Record<string, unknown>): Record<string, string> =>
  Object.fromEntries(Object.entries(row).map(([key, value]) => [key, value === null || value === undefined ? "" : String(value)]));

/** UTF-8 로 디코드하고, 치환문자(U+FFFD)가 보이면 EUC-KR(cp949)로 재디코드한다. */
const decodeBuffer = (buffer: Buffer): string => {
  const utf8 = new TextDecoder("utf-8").decode(buffer);
  if (!utf8.includes("�")) {
    return stripBom(utf8);
  }
  try {
    return stripBom(new TextDecoder("euc-kr").decode(buffer));
  } catch {
    return stripBom(utf8);
  }
};

const stripBom = (text: string): string => (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);

const parseCsv = (text: string): Record<string, string>[] => {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    return [];
  }
  const headers = splitCsvLine(lines[0]!);
  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });
};

const splitCsvLine = (line: string): string[] => {
  const values: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current);
  return values.map((value) => value.trim());
};

// --- 컬럼 매핑 -------------------------------------------------------------

const findValue = (row: Record<string, string>, keywords: string[]): string | undefined => {
  for (const [key, value] of Object.entries(row)) {
    const header = key.replace(/\s/g, "");
    if (keywords.some((keyword) => header.includes(keyword)) && value !== "") {
      return value;
    }
  }
  return undefined;
};

const TRUTHY = ["y", "1", "true", "t", "o", "○", "있음", "유", "가능", "설치", "적합", "예", "함"];
const FALSY = ["n", "0", "false", "x", "없음", "무", "불가", "미설치", "부적합", "아니오", "해당없음"];

/** 편의시설 컬럼 값이 '있음/설치/가능/개수>0' 이면 true 로 본다. */
const isTruthy = (value: string | undefined): boolean => {
  if (value === undefined) {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "") {
    return false;
  }
  if (FALSY.includes(normalized)) {
    return false;
  }
  const asNumber = Number(normalized);
  if (Number.isFinite(asNumber)) {
    return asNumber > 0;
  }
  if (TRUTHY.includes(normalized)) {
    return true;
  }
  // "설치됨", "있음(1개)" 등 부분 문자열 매칭
  return ["있", "설치", "가능", "적합", "유"].some((token) => normalized.includes(token));
};

const parseCoordinate = (value: string | undefined): number | undefined => {
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) && parsed !== 0 ? parsed : undefined;
};

export const rowToBuildingAccessibility = (
  row: Record<string, string>,
  source: string,
  markAllBfCertified = false
): BuildingAccessibility | undefined => {
  const name = findValue(row, ["시설명", "건물명", "명칭", "faclNm", "업소명", "상호"]);
  const lat = parseCoordinate(findValue(row, ["위도", "latitude", "lat", "yGis", "WGS84위도"]));
  const lng = parseCoordinate(findValue(row, ["경도", "longitude", "lng", "lon", "xGis", "WGS84경도"]));
  if (!name || lat === undefined || lng === undefined) {
    return undefined; // 좌표/이름 없는 레코드는 매칭 불가라 제외
  }

  const roadAddress = findValue(row, ["도로명주소", "소재지도로명", "도로명"]);
  const jibunAddress = findValue(row, ["지번주소", "소재지지번", "지번", "소재지주소", "주소"]);

  // BF 컬럼은 "인증", "예비인증", "우수" 등 등급 문자열이 들어올 수 있으므로
  // 명시적 부정값("없음"/"N"/"미인증")만 아니면 인증으로 본다.
  const bfRaw = findValue(row, ["BF", "무장애", "베리어", "바리어"]);
  const bfCertified =
    markAllBfCertified ||
    (bfRaw !== undefined && !FALSY.includes(bfRaw.trim().toLowerCase()) && !bfRaw.includes("미인증"));

  return {
    name,
    address: jibunAddress,
    roadAddress,
    lat,
    lng,
    bfCertified,
    hasElevator: isTruthy(findValue(row, ["승강기", "엘리베이터", "리프트"])),
    hasAccessibleRestroom: isTruthy(findValue(row, ["장애인용화장실", "장애인화장실", "화장실"])),
    hasThresholdRemoved: isTruthy(findValue(row, ["높이차이", "턱제거", "턱"])),
    hasEntranceRamp: isTruthy(findValue(row, ["경사로", "접근로"])),
    hasAccessibleParking: isTruthy(findValue(row, ["장애인전용주차", "장애인주차", "주차"])),
    source,
    raw: row
  };
};
