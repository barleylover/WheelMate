// 사용자 추가 요구사항 "프랜차이즈 제외"를 위한 대표 프랜차이즈/체인 키워드.
// 완전하지는 않으며 필요 시 계속 추가한다.
const FRANCHISE_KEYWORDS = [
  // 카페 (국문)
  "스타벅스", "투썸", "이디야", "메가커피", "메가엠지씨", "빽다방", "커피빈", "할리스",
  "컴포즈", "폴바셋", "엔제리너스", "탐앤탐스", "공차", "매머드", "더벤티", "파스쿠찌",
  "카페베네", "블루보틀", "요거프레소", "달콤", "감성커피", "설빙", "마노핀", "쥬스식스",
  "쥬씨", "드롭탑", "셀렉토", "토프레소", "커피나무", "빈스빈스", "봄봄", "유동커피", "백억커피",
  "메가", "mgc", "바나프레소", "banapresso", "더리터", "텐퍼센트", "스무디킹", "smoothieking", "요아정",
  // 카페 (영문 표기 - Google 응답 대응)
  "starbucks", "twosome", "ediya", "megacoffee", "paikdabang", "coffeebean", "hollys",
  "compose", "paulbassett", "angelinus", "tomntoms", "gongcha", "pascucci", "caffebene",
  "bluebottle", "sulbing", "manoffin", "juicy",
  // 음식점/패스트푸드 (국문)
  "맥도날드", "롯데리아", "버거킹", "맘스터치", "kfc", "서브웨이", "노브랜드버거", "배스킨라빈스",
  "던킨", "김밥천국", "본죽", "한솥", "청년다방", "명륜진사갈비", "놀부", "이삭토스트", "역전우동",
  "신전떡볶이", "죠스떡볶이", "빕스", "아웃백", "교촌", "bhc", "bbq", "네네치킨", "굽네", "페리카나",
  "명량핫도그",
  // 음식점/패스트푸드 (영문)
  "mcdonald", "burgerking", "lotteria", "momstouch", "subway", "outback"
];

const FRANCHISE_CUES = ["프랜차이즈", "프렌차이즈", "체인", "franchise", "chain"];
const EXCLUDE_CUES = ["제외", "빼고", "말고", "없는", "아닌", "아니", "exclude", "except", "without", "no "];

const normalize = (value: string): string => value.replace(/\s+/g, "").toLowerCase();

/** 매장 이름이 대표 프랜차이즈에 해당하는지 판단한다. */
export const isFranchise = (placeName: string): boolean => {
  const name = normalize(placeName);
  return FRANCHISE_KEYWORDS.some((keyword) => name.includes(normalize(keyword)));
};

/** 원문 질의나 preferences 문구에서 "프랜차이즈 제외" 의도를 감지한다(프랜차이즈 언급 + 제외 뉘앙스). */
export const hasExcludeFranchiseIntent = (text: string | undefined): boolean => {
  if (!text) {
    return false;
  }
  const value = text.toLowerCase();
  const mentionsFranchise = FRANCHISE_CUES.some((cue) => value.includes(cue.toLowerCase()));
  const mentionsExclude = EXCLUDE_CUES.some((cue) => value.includes(cue.toLowerCase()));
  return mentionsFranchise && mentionsExclude;
};

/**
 * 사용자의 "프랜차이즈 제외" 요구를 최종 판단한다.
 * 명시적 exclude_franchise 플래그가 우선하고, 없으면 query/preferences 문구에서 추론한다.
 */
export const shouldExcludeFranchise = (input: {
  exclude_franchise?: boolean;
  query?: string;
  preferences?: string[];
}): boolean => {
  if (typeof input.exclude_franchise === "boolean") {
    return input.exclude_franchise;
  }
  const texts = [input.query, ...(input.preferences ?? [])];
  return texts.some(hasExcludeFranchiseIntent);
};
