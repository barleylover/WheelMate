import { normalizeText } from "./normalize.js";

const SIDO_ALIASES: Record<string, string> = {
  서울특별시: "서울",
  서울시: "서울",
  서울: "서울",
  부산광역시: "부산",
  부산시: "부산",
  부산: "부산",
  대구광역시: "대구",
  대구시: "대구",
  대구: "대구",
  인천광역시: "인천",
  인천시: "인천",
  인천: "인천",
  광주광역시: "광주",
  광주시: "광주",
  광주: "광주",
  대전광역시: "대전",
  대전시: "대전",
  대전: "대전",
  울산광역시: "울산",
  울산시: "울산",
  울산: "울산",
  세종특별자치시: "세종",
  세종시: "세종",
  세종: "세종",
  경기도: "경기",
  경기: "경기",
  강원특별자치도: "강원",
  강원도: "강원",
  강원: "강원",
  충청북도: "충북",
  충북: "충북",
  충청남도: "충남",
  충남: "충남",
  전북특별자치도: "전북",
  전라북도: "전북",
  전북: "전북",
  전남특별자치도: "전남",
  전라남도: "전남",
  전남: "전남",
  경상북도: "경북",
  경북: "경북",
  경상남도: "경남",
  경남: "경남",
  제주특별자치도: "제주",
  제주도: "제주",
  제주: "제주"
};

export interface AddressArea {
  region1?: string;
  region2?: string;
  region3?: string;
  tokens: string[];
}

function canonicalSido(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return SIDO_ALIASES[value] ?? value;
}

function usefulTokens(tokens: string[]): string[] {
  return tokens.filter((token) =>
    token.length >= 2 &&
    !/^\d/.test(token) &&
    !/^\d+-?\d*$/.test(token) &&
    !token.endsWith("번지")
  );
}

function specificTokenStartIndex(area: AddressArea): number {
  if (area.region2?.endsWith("시") && (area.region3?.endsWith("구") || area.region3?.endsWith("군"))) {
    return 3;
  }
  return 2;
}

export function parseAddressArea(address: string | undefined | null): AddressArea {
  const tokens = normalizeText(address ?? "")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
  return {
    region1: canonicalSido(tokens[0]),
    region2: tokens[1],
    region3: tokens[2],
    tokens
  };
}

export function addressAreaScore(placeAddress: string | undefined, facilityAddress: string | undefined): number {
  const place = normalizeText(placeAddress ?? "");
  const facility = normalizeText(facilityAddress ?? "");
  if (!place || !facility) return 0;
  if (place === facility || place.includes(facility) || facility.includes(place)) return 100;

  const placeArea = parseAddressArea(place);
  const facilityArea = parseAddressArea(facility);
  let score = 0;
  if (placeArea.region1 && placeArea.region1 === facilityArea.region1) score += 20;
  if (placeArea.region2 && placeArea.region2 === facilityArea.region2) score += 25;
  if (placeArea.region3 && placeArea.region3 === facilityArea.region3) score += 10;

  const placeTokens = new Set(usefulTokens(placeArea.tokens.slice(specificTokenStartIndex(placeArea))));
  let sharedSpecificTokens = 0;
  for (const token of usefulTokens(facilityArea.tokens.slice(specificTokenStartIndex(facilityArea)))) {
    if (placeTokens.has(token)) sharedSpecificTokens += 1;
  }
  score += Math.min(sharedSpecificTokens, 2) * 20;
  return Math.min(score, 99);
}
