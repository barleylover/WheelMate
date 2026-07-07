import type { NormalizedSearchResult, ReviewSignal, SignalPolarity, SignalStrength, SignalType } from "../types.js";
import { sanitizeHtmlText } from "./htmlSanitizer.js";

interface PatternSpec {
  pattern: RegExp;
  polarity: SignalPolarity;
  strength: SignalStrength;
  type: SignalType;
}

const STRONG_POSITIVE: PatternSpec[] = [
  { pattern: /(?:전동)?휠체어.{0,12}(?:출입|입장|진입|접근|이용)\s*(?:가능|괜찮|편함|편해)/g, polarity: "positive", strength: "strong", type: "wheelchair_direct" },
  { pattern: /(?:전동)?휠체어.{0,14}(?:들어갈 수|갈 수|이용할 수|탈 수)/g, polarity: "positive", strength: "strong", type: "wheelchair_direct" },
  { pattern: /(?:무장애|배리어프리|베리어프리|barrier\s*free)/gi, polarity: "positive", strength: "strong", type: "wheelchair_direct" },
  { pattern: /(?:단차|문턱|턱)(?:이|가)?\s*(?:없음|없고|없이|없는|낮음|낮아)/g, polarity: "positive", strength: "strong", type: "entrance_step" },
  { pattern: /(?:계단|스텝)(?:이|가)?\s*(?:없음|없고|없이|없는)/g, polarity: "positive", strength: "strong", type: "stairs" },
  { pattern: /(?:경사로|슬로프)(?:가|는)?\s*(?:있음|있는|있어서|설치|구비)/g, polarity: "positive", strength: "strong", type: "ramp" },
  { pattern: /(?:장애인|다목적|무장애)\s*화장실(?:이|가)?\s*(?:있음|있는|있어서|가능|구비)/g, polarity: "positive", strength: "strong", type: "restroom" },
  { pattern: /화장실.{0,12}(?:휠체어|장애인).{0,8}(?:가능|이용)/g, polarity: "positive", strength: "strong", type: "restroom" },
  { pattern: /장애인\s*주차\s*(?:가능|있음|있는)/g, polarity: "positive", strength: "strong", type: "unknown" },
  { pattern: /(?:엘리베이터|엘베|승강기)(?:가|는)?\s*(?:있음|있는|있어서|가능|이용)/g, polarity: "positive", strength: "medium", type: "elevator" }
];

const WEAK_POSITIVE: PatternSpec[] = [
  { pattern: /유(?:모|아)차.{0,10}(?:가능|끌고 가능|들어갈 수|이용 가능|편함|편해)/g, polarity: "positive", strength: "weak", type: "stroller_proxy" },
  { pattern: /입구(?:가|는)?\s*(?:넓음|넓고|넓어|넓은)/g, polarity: "positive", strength: "weak", type: "entrance_step" },
  { pattern: /(?:통로|좌석\s*간격|테이블\s*간격)(?:가|이|은)?\s*(?:넓음|넓고|넓어|넓은)/g, polarity: "positive", strength: "weak", type: "seating_or_space" },
  { pattern: /자동문/g, polarity: "positive", strength: "weak", type: "entrance_step" },
  { pattern: /이동\s*편함|이동하기\s*편/g, polarity: "positive", strength: "weak", type: "unknown" }
];

const STRONG_NEGATIVE: PatternSpec[] = [
  { pattern: /(?:전동)?휠체어.{0,12}(?:불가|어렵|힘들|무리|못\s*들어)/g, polarity: "negative", strength: "strong", type: "wheelchair_direct" },
  { pattern: /(?:엘리베이터|엘베|승강기)(?:가|는)?\s*(?:없음|없는|없어서|없어)/g, polarity: "negative", strength: "strong", type: "elevator" },
  { pattern: /계단(?:만|으로만)\s*(?:있음|이용)|계단.{0,8}(?:올라가야|올라가|이용해야)/g, polarity: "negative", strength: "strong", type: "stairs" },
  { pattern: /(?:문턱|단차|턱)(?:이|가)?\s*(?:높음|높고|높아|있음|있는|있어서)/g, polarity: "negative", strength: "strong", type: "entrance_step" },
  { pattern: /(?:경사로|슬로프)(?:가|는)?\s*(?:없음|없는|없어서|없어)/g, polarity: "negative", strength: "strong", type: "ramp" },
  { pattern: /입구(?:가|는)?\s*(?:좁음|좁고|좁아|좁은)/g, polarity: "negative", strength: "strong", type: "narrow_space" },
  { pattern: /화장실(?:이|은)?\s*(?:좁음|좁고|좁아|좁은|계단|2층|지하)/g, polarity: "negative", strength: "strong", type: "restroom" }
];

const CAUTION: PatternSpec[] = [
  { pattern: /계단/g, polarity: "ambiguous", strength: "weak", type: "stairs" },
  { pattern: /지하|반지하/g, polarity: "ambiguous", strength: "weak", type: "basement_or_floor" },
  { pattern: /(?:^|\s)1층(?=\s|$|[,.에은이가의])/g, polarity: "ambiguous", strength: "weak", type: "basement_or_floor" },
  { pattern: /2층|복층/g, polarity: "ambiguous", strength: "weak", type: "basement_or_floor" },
  { pattern: /좁은|좁음|협소/g, polarity: "ambiguous", strength: "weak", type: "narrow_space" },
  { pattern: /웨이팅|혼잡/g, polarity: "ambiguous", strength: "weak", type: "unknown" }
];

function collectMatches(text: string, specs: PatternSpec[]): ReviewSignal[] {
  const signals: ReviewSignal[] = [];
  for (const spec of specs) {
    for (const match of text.matchAll(spec.pattern)) {
      if (
        spec.polarity === "negative" &&
        spec.type === "wheelchair_direct" &&
        /휠체어.{0,14}(?:가능|이용)/.test(match[0])
      ) {
        continue;
      }
      signals.push({
        polarity: spec.polarity,
        type: spec.type,
        matched_text: match[0],
        strength: spec.strength
      });
    }
  }
  return signals;
}

function isStationElevatorContext(text: string): boolean {
  return /(?:지하철역|전철역|역).{0,12}(?:엘리베이터|엘베)|(?:엘리베이터|엘베).{0,12}(?:지하철역|전철역)/.test(text);
}

function dedupeSignals(signals: ReviewSignal[]): ReviewSignal[] {
  const seen = new Set<string>();
  return signals.filter((signal) => {
    const key = `${signal.polarity}:${signal.type}:${signal.matched_text}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function extractSignalsFromText(rawText: string): ReviewSignal[] {
  const text = sanitizeHtmlText(rawText);
  const signals = [
    ...collectMatches(text, STRONG_NEGATIVE),
    ...collectMatches(text, STRONG_POSITIVE),
    ...collectMatches(text, WEAK_POSITIVE),
    ...collectMatches(text, CAUTION)
  ];

  if (isStationElevatorContext(text)) {
    return dedupeSignals([
      ...signals.filter((signal) => signal.type !== "elevator" || signal.polarity !== "positive"),
      {
        polarity: "ambiguous",
        type: "elevator",
        matched_text: "지하철역 엘리베이터",
        strength: "weak"
      }
    ]);
  }

  return dedupeSignals(signals);
}

export function extractSignals(result: Pick<NormalizedSearchResult, "title" | "snippet">): ReviewSignal[] {
  return extractSignalsFromText(`${result.title} ${result.snippet}`);
}
