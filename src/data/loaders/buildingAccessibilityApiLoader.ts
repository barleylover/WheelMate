import type { BuildingAccessibility } from "../../core/types.js";
import type { LoaderContext, LoaderResult, PublicDataLoader } from "./types.js";

/**
 * 전국장애인편의시설표준데이터 data.go.kr OpenAPI(B554287) 직접 연동 로더.
 *
 * - 목록: getDisConvFaclList → 좌표(faclLat/faclLng)·이름·주소·wfcltId (features 없음)
 * - 상세: getFacInfoOpenApiJpEvalInfoList?wfcltId= → evalInfo(경사로/승강기/화장실 등 features)
 *
 * ⚠️ 개발계정 100콜/일 제한 + 목록에 지역 필터가 없어(전국 ID 순 페이지) 전국 정밀 적재는
 *    파일 다운로드가 유리하다. 이 로더는 쿼터 가드(maxPages/evalLimit) 하에서 API 연동을 제공한다.
 *
 * 제어 env:
 *   PUBLIC_DATA_SERVICE_KEY   (필수)
 *   PUBLIC_DATA_MAX_PAGES     목록 페이지 수 (기본 3)
 *   PUBLIC_DATA_NUM_ROWS      페이지당 건수 (기본 1000)
 *   PUBLIC_DATA_EVAL_LIMIT    features 를 실제로 채울 시설 수(eval 호출 수, 기본 0=생략 → 일반 B등급)
 *   PUBLIC_DATA_SIDO          주소 접두 필터(클라이언트측). 예: "서울특별시" (선택)
 */
const BASE = "http://apis.data.go.kr/B554287/DisabledPersonConvenientFacility";

const intEnv = (name: string, fallback: number): number => {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const pick = (xml: string, tag: string): string | undefined => {
  const match = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return match?.[1]?.trim() || undefined;
};

const servListBlocks = (xml: string): string[] =>
  [...xml.matchAll(/<servList>([\s\S]*?)<\/servList>/g)].map((match) => match[1] ?? "");

/** evalInfo 문자열(예: "승강기, 장애인사용가능화장실, 주출입구 높이차이 제거, 주출입구 접근로")을 feature 플래그로 변환. */
const evalInfoToFlags = (
  evalInfo: string | undefined
): Pick<
  BuildingAccessibility,
  "hasElevator" | "hasAccessibleRestroom" | "hasThresholdRemoved" | "hasEntranceRamp" | "hasAccessibleParking"
> => {
  const text = evalInfo ?? "";
  return {
    hasElevator: text.includes("승강기"),
    hasAccessibleRestroom: text.includes("화장실"),
    hasThresholdRemoved: text.includes("높이차이 제거") || text.includes("턱"),
    hasEntranceRamp: text.includes("접근로") || text.includes("경사로"),
    hasAccessibleParking: text.includes("전용주차")
  };
};

const fetchText = async (path: string, params: Record<string, string>): Promise<string> => {
  const url = new URL(`${BASE}/${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.text();
};

export const buildingAccessibilityApiLoader: PublicDataLoader = {
  source: "전국장애인편의시설표준데이터(OpenAPI)",
  async load({ db }: LoaderContext): Promise<LoaderResult> {
    const serviceKey = process.env.PUBLIC_DATA_SERVICE_KEY;
    if (!serviceKey) {
      return { source: this.source, status: "skipped", loadedCount: 0, message: "PUBLIC_DATA_SERVICE_KEY 미설정" };
    }

    const maxPages = intEnv("PUBLIC_DATA_MAX_PAGES", 3);
    const numRows = intEnv("PUBLIC_DATA_NUM_ROWS", 1000);
    const evalLimit = Number.parseInt(process.env.PUBLIC_DATA_EVAL_LIMIT ?? "0", 10) || 0;
    const sidoFilter = process.env.PUBLIC_DATA_SIDO?.trim();

    let loaded = 0;
    let evaluated = 0;

    for (let page = 1; page <= maxPages; page += 1) {
      const xml = await fetchText("getDisConvFaclList", {
        serviceKey,
        numOfRows: String(numRows),
        pageNo: String(page)
      });
      const blocks = servListBlocks(xml);
      if (blocks.length === 0) {
        break;
      }

      for (const block of blocks) {
        const name = pick(block, "faclNm");
        const lat = Number(pick(block, "faclLat"));
        const lng = Number(pick(block, "faclLng"));
        const wfcltId = pick(block, "wfcltId");
        const address = pick(block, "lcMnad");
        if (!name || !Number.isFinite(lat) || !Number.isFinite(lng) || lat === 0 || lng === 0) {
          continue;
        }
        if (sidoFilter && !(address ?? "").startsWith(sidoFilter)) {
          continue;
        }

        let flags = evalInfoToFlags(undefined);
        if (wfcltId && evaluated < evalLimit) {
          try {
            const evalXml = await fetchText("getFacInfoOpenApiJpEvalInfoList", { serviceKey, wfcltId });
            flags = evalInfoToFlags(pick(evalXml, "evalInfo"));
            evaluated += 1;
          } catch {
            // eval 실패 시 일반 편의시설로만 적재
          }
        }

        const record: BuildingAccessibility = {
          name,
          address,
          lat,
          lng,
          bfCertified: false, // BF 인증은 별도 데이터셋(bfKead/bfKoddi)에서 부여
          source: this.source,
          raw: { wfcltId },
          ...flags
        };
        db.insertBuildingAccessibility(record);
        loaded += 1;
      }

      if (blocks.length < numRows) {
        break; // 마지막 페이지
      }
    }

    return {
      source: this.source,
      status: loaded > 0 ? "loaded" : "skipped",
      loadedCount: loaded,
      message: `${loaded}건 적재 (features 조회 ${evaluated}건, 나머지는 일반 장애인편의시설=B등급)`
    };
  }
};
