import type { Origin } from "../types.js";

export type LocationScope = "point" | "region";

const REGION_ALIASES = new Map<string, string>([
  ["서울", "서울"], ["서울시", "서울"], ["서울특별시", "서울"],
  ["부산", "부산"], ["부산시", "부산"], ["부산광역시", "부산"],
  ["대구", "대구"], ["대구시", "대구"], ["대구광역시", "대구"],
  ["인천", "인천"], ["인천시", "인천"], ["인천광역시", "인천"],
  ["광주", "광주"], ["광주시", "광주"], ["광주광역시", "광주"],
  ["대전", "대전"], ["대전시", "대전"], ["대전광역시", "대전"],
  ["울산", "울산"], ["울산시", "울산"], ["울산광역시", "울산"],
  ["세종", "세종"], ["세종시", "세종"], ["세종특별자치시", "세종"],
  ["경기", "경기"], ["경기도", "경기"],
  ["강원", "강원"], ["강원도", "강원"], ["강원특별자치도", "강원"],
  ["충북", "충북"], ["충청북도", "충북"],
  ["충남", "충남"], ["충청남도", "충남"],
  ["전북", "전북"], ["전라북도", "전북"], ["전북특별자치도", "전북"],
  ["전남", "전남"], ["전라남도", "전남"],
  ["경북", "경북"], ["경상북도", "경북"],
  ["경남", "경남"], ["경상남도", "경남"],
  ["제주", "제주"], ["제주도", "제주"], ["제주특별자치도", "제주"]
]);

const ADMINISTRATIVE_CENTERS = new Map<string, string>([
  ["서울", "서울특별시청"], ["부산", "부산광역시청"], ["대구", "대구광역시청"],
  ["인천", "인천광역시청"], ["광주", "광주광역시청"], ["대전", "대전광역시청"],
  ["울산", "울산광역시청"], ["세종", "세종특별자치시청"], ["경기", "경기도청"],
  ["강원", "강원특별자치도청"], ["충북", "충청북도청"], ["충남", "충청남도청"],
  ["전북", "전북특별자치도청"], ["전남", "전라남도청"], ["경북", "경상북도청"],
  ["경남", "경상남도청"], ["제주", "제주특별자치도청"]
]);

// Kakao's first result for a bare colloquial area can be a similarly named
// road or university anywhere in Korea (for example, "대학로" resolved to
// Kumoh National Institute of Technology). Use a canonical landmark only for
// exact, nationally conventional aliases; explicit city/area inputs remain
// untouched.
const LOCATION_RESOLUTION_QUERIES = new Map<string, string>([
  ["대학로", "혜화역"]
]);

const KNOWN_LOCAL_AREAS = new Set([
  "강남", "홍대", "신촌", "사당", "성수", "잠실", "청담", "압구정", "명동", "종로",
  "이태원", "여의도", "서면", "해운대", "주안", "부평", "동성로", "수원", "전주",
  "대학로", "건대", "왕십리", "연남", "합정", "망원", "상수", "을지로", "인사동",
  "판교", "용산", "서울숲", "충장로", "제주시", "서귀포", "행궁동", "여의도",
  "인천", "제주", "전주", "수원", "강릉", "청주", "천안", "포항", "창원", "김해",
  "여수", "순천", "경주", "춘천", "원주", "군산", "목포", "익산", "안동",
  "공덕", "광화문", "문래", "잠실새내", "마곡나루", "오송", "애월", "광안리",
  "수성못", "북촌", "송도", "신림", "성수"
]);

const LOCATION_SUFFIX = /(?:역|동|구|시|군|도|읍|면|리|공항|터미널|시장|마을|광장|거리|길|캠퍼스|대학교|해수욕장|공원|궁|몰|백화점|서울숲)$/;

const NON_LOCATION_TOKEN = /^(?:휠체어|전동휠체어|유모차|장애인|이동약자|접근성|접근|출입|가능|카페|커피|까페|커피숍|베이커리|빵집|베이글|음식점|식당|맛집|밥집|레스토랑|횟집|회|생선회|한식|중식|일식|양식|분식|술집|펍|바|박물관|미술관|갤러리|전시|극장|영화관|공연장|문화시설|화장실|충전기|계단|문턱|단차|경사로|엘리베이터|추천|추천해줘|찾아줘|알려줘|조용한|넓은|좋은|편한|24시간)$/;

const CORRECTION_SEPARATOR = /(?:말고|아니라|아니고|대신|싫고)/;

function looksLikeLocationValue(value: string): boolean {
  const compactValue = value.replace(/\s+/g, "");
  return REGION_ALIASES.has(compactValue) ||
    KNOWN_LOCAL_AREAS.has(value) ||
    (!NON_LOCATION_TOKEN.test(value) && LOCATION_SUFFIX.test(value));
}

export function normalizeLocationScope(value: string): string {
  let normalized = value
    .normalize("NFKC")
    .replace(/[?!.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  let previous = "";
  while (normalized && normalized !== previous) {
    previous = normalized;
    normalized = normalized
      .replace(/\s*(?:전체(?:에서|의)?|전역(?:에서|의)?|전\s*지역(?:에서|의)?|일대(?:에서|의)?)\s*$/g, "")
      .replace(/(?:근처|주변|인근|부근|근방|쪽)\s*$/g, "")
      .replace(/\s+/g, " ")
      .trim();
    const particleMatch = normalized.match(/(?:에서는|에는|으로는|로는|에서요|에서|으로|로|에|엔|의|은|는)$/);
    if (particleMatch) {
      const candidate = normalized.slice(0, -particleMatch[0].length).trim();
      if (looksLikeLocationValue(candidate) || /(?:근처|주변|인근|부근|근방|쪽)$/.test(candidate)) {
        normalized = candidate;
      }
    }
  }
  return normalized
    .replace(/([가-힣A-Za-z0-9]+)\s+역(?=\s|$)/g, "$1역")
    .trim();
}

function compact(value: string): string {
  return normalizeLocationScope(value).replace(/\s+/g, "");
}

export function canonicalRegion(value: string): string | null {
  return REGION_ALIASES.get(compact(value)) ?? null;
}

export function locationScope(value: string): LocationScope {
  return canonicalRegion(value) ? "region" : "point";
}

export function regionAddressToken(value: string): string | null {
  return canonicalRegion(value);
}

export function administrativeCenterQuery(value: string): string {
  const region = canonicalRegion(value);
  if (region) return ADMINISTRATIVE_CENTERS.get(region) ?? value;
  return LOCATION_RESOLUTION_QUERIES.get(normalizeLocationScope(value)) ?? value;
}

function normalizeToken(token: string): string {
  let withoutParticle = token;
  let previous = "";
  while (withoutParticle && withoutParticle !== previous) {
    previous = withoutParticle;
    withoutParticle = withoutParticle
      .replace(/(?:에서는|에는|으로는|로는|에서요|에서|으로|로|에|엔|의|은|는)$/, "")
      .replace(/(?:근처|주변|인근|부근|근방|쪽)$/, "");
  }
  if (
    withoutParticle !== token &&
    (Boolean(canonicalRegion(withoutParticle)) || KNOWN_LOCAL_AREAS.has(withoutParticle) || hasLocationSuffix(withoutParticle))
  ) {
    return withoutParticle;
  }
  return token;
}

function hasLocationSuffix(token: string): boolean {
  return !NON_LOCATION_TOKEN.test(token) && LOCATION_SUFFIX.test(token);
}

function locationStart(token: string): boolean {
  return Boolean(canonicalRegion(token)) || KNOWN_LOCAL_AREAS.has(token) || (token.length >= 3 && hasLocationSuffix(token));
}

function isUsefulContinuation(token: string): boolean {
  return !NON_LOCATION_TOKEN.test(token) &&
    (KNOWN_LOCAL_AREAS.has(token) || hasLocationSuffix(token) || /^[A-Za-z0-9가-힣]{2,12}$/.test(token));
}

function inferLocationFromSegment(query: string): string | undefined {
  const normalized = query
    .normalize("NFKC")
    .replace(/[?!.,]/g, " ")
    .replace(/(?:전체에서|전체|전역(?:에서|의)?|전\s*지역(?:에서|의)?|일대)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const tokens = normalized.split(/\s+/).map(normalizeToken).filter(Boolean);

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]!;
    if (!locationStart(token)) continue;

    const isRegionOrKnown = Boolean(canonicalRegion(token)) || KNOWN_LOCAL_AREAS.has(token);
    if (!isRegionOrKnown || (hasLocationSuffix(token) && !canonicalRegion(token) && token !== "여의도")) {
      return normalizeLocationScope(token);
    }

    const lookahead = tokens.slice(index + 1, index + 4);
    const suffixOffset = lookahead.findIndex((item) => hasLocationSuffix(item));
    if (suffixOffset >= 0) {
      return normalizeLocationScope(tokens.slice(index, index + suffixOffset + 2).join(" "));
    }
    const next = lookahead[0];
    if (next && (KNOWN_LOCAL_AREAS.has(next) || hasLocationSuffix(next))) {
      return normalizeLocationScope(`${token} ${next}`);
    }
    if (next && canonicalRegion(token) && isUsefulContinuation(next) && KNOWN_LOCAL_AREAS.has(next)) {
      return normalizeLocationScope(`${token} ${next}`);
    }
    return normalizeLocationScope(token);
  }
  return undefined;
}

export function inferLocationFromQuery(query?: string): string | undefined {
  if (!query?.trim()) return undefined;
  const segments = query.split(CORRECTION_SEPARATOR).map((item) => item.trim()).filter(Boolean);
  for (const segment of [...segments].reverse()) {
    const location = inferLocationFromSegment(segment);
    if (location) return location;
  }
  return undefined;
}

export function originIsResolved(origin: Origin): boolean {
  return origin.provider !== "unresolved" &&
    Number.isFinite(origin.lat) &&
    Number.isFinite(origin.lng) &&
    !(origin.lat === 0 && origin.lng === 0);
}
