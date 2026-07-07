# WheelMate 인수인계 (Handover)

휠체어 접근성 기반 장소 추천 MCP 서버 (카카오 AGENTIC PLAYER 10 / PlayMCP 출품작)

- GitHub: https://github.com/barleylover/WheelMate
- 작업 브랜치: `feat/scoring-v2-full` (열린 PR: #1 → base `feat/wheelmate-mcp`)
- 스택: Node.js 24+, pnpm(corepack), TypeScript(ESM), `@modelcontextprotocol/sdk`, vitest, `node:sqlite`

## 새 컴퓨터 세팅

```bash
# 1) Node.js 24+  (winget install OpenJS.NodeJS.LTS)
# 2) 클론 + 브랜치
git clone https://github.com/barleylover/WheelMate.git
cd WheelMate
git checkout feat/scoring-v2-full
# 3) 의존성
corepack pnpm install        # 또는  npm install
# 4) .env 생성: .env.example 복사 후 키 입력 (키 값은 안전하게 이동, 커밋 금지)
# 5) 검증
corepack pnpm test                              # 40개 통과가 정상
corepack pnpm run dev -- --sample 성수역 cafe   # 아래 "검증 결과" 참고
```

## `.env` 키 (값은 별도로 안전하게 이동, `.env`는 gitignore됨)

| 변수 | 발급처 | 용도 |
|---|---|---|
| `KAKAO_REST_API_KEY` | Kakao Developers (REST API 키) | **필수** — 위치 지오코딩·장소 검색 |
| `GOOGLE_MAPS_API_KEY` | Google Cloud (Places API New) | 휠체어 접근성 **C등급** 보강(fallback) |
| `PUBLIC_DATA_SERVICE_KEY` | data.go.kr | 장애인편의시설/BF → **A·B등급** |
| `KTO_SERVICE_KEY`, `CULTURE_BIGDATA_API_KEY` | data.go.kr / 문화포털 | 아직 미사용(문화·관광 loader skeleton) |

> 참고: `KTO`/`CULTURE`는 원래 별도 포털 키지만 현재 로더가 skeleton이라 값이 무엇이든 동작에 영향 없음.

## 완료된 작업 (브랜치 `feat/scoring-v2-full`, 커밋 2개)

- **등급 판정**: BF인증(A) > 경사로·승강기·장애인화장실·턱제거(B) > Google/OSM 휠체어접근(C) > 그외(D) — `src/core/scoring.ts`
- **점수 v2**: BF +30 / 턱없음 +20 / 경사로·승강기 +15 / 건물 내 화장실 +15 / 주변 화장실·충전기 500m +10, weak 매칭 50%, evidence_type당 1회
- **랭킹**: 등급 우선 → 점수 → 거리 — `src/core/ranking.ts`
- **후보 구성**: 추천 후보는 Kakao만, Google/OSM/공공데이터는 근거 보강 전용(`enrichWithEvidence`) — `src/core/recommendationService.ts`
- **공공데이터 A/B 연동**: `building_accessibility` 테이블(`schema.sql`) + 조회/적재(`db.ts`) + 한글 컬럼 유연 매핑 로더(`buildingAccessibilityRawLoader.ts`, UTF-8/EUC-KR 자동) → 좌표·이름·주소로 후보 매칭
- **Google fallback**: `GOOGLE_FALLBACK_ONLY`(기본 true) — 상위 후보에 A/B 근거가 없을 때만 유료 호출 + `api_cache` 캐시
- **카카오맵 링크 수정**: 위치는 `place_url`→없으면 주소 기반, 길찾기는 `?sName=출발&eName=도착` (폐기된 `/link/to` 제거) — `src/core/links.ts`
- **추천 이유**(`recommendation_reason`), **프랜차이즈 제외**(`exclude_franchise`) — `src/core/{evidence,franchise}.ts`
- **기본값** radius 800→1000, limit 5→3, 카카오 2페이지(최대 30건)
- 버그 수정: `ingest.ts` Windows 진입점, `package.json` build의 `cp` → node 복사(크로스플랫폼)

## ✅ 검증 결과 (예시 데이터로 A/B 등급 확인 — 2026-07-07)

`data/raw/disability_facilities.example.json`을 `disability_facilities.json`으로 복사 → `pnpm run ingest` → `--sample 성수역 cafe`:

| 순위 | 매장 | 등급 | 근거 |
|---|---|---|---|
| 1 | 메가MGC커피 성수역점 | **A** | BF 인증 매칭 |
| 2 | 스타벅스 성수점 | **B** (75점) | 경사로·승강기·장애인화장실·주차 |
| 3 | 에낭 성수점 | D | 근거 없음 |

- 등급 우선 랭킹 정상(A가 더 높은 점수의 B보다 위), `Google Places: skipped`(A/B가 있어 유료 호출 안 함) 확인.
- **주의**: 공공데이터가 없는 지역(예: 홍대입구역)은 상위가 D → Google fallback이 호출됨. 이는 데이터 커버리지 문제이며, 아래 "실제 데이터 적재"로 해소됨.

## 실제 데이터로 A/B 등급 켜는 법

```bash
# 파이프라인만 즉시 테스트:
cp data/raw/disability_facilities.example.json data/raw/disability_facilities.json
corepack pnpm run ingest

# 실데이터: data.go.kr 전국장애인편의시설표준데이터(15100058) 그리드 탭에서
#   JSON/CSV 다운로드 → data/raw/disability_facilities.json (또는 .csv) 저장 후 ingest
# BF(A등급): data/raw/bf_kead.json 또는 bf_koddi.json
# (data/raw/*.json, *.db 는 gitignore됨 — 커밋되지 않음)
```

로더는 한글 헤더를 키워드로 유연 매핑(`시설명/위도/경도/경사로/승강기/장애인화장실/BF...`)하므로 표준데이터 컬럼명이 조금 달라도 대개 매칭됨.

### 방법 B: data.go.kr OpenAPI 직접 연동 (`pnpm run ingest:api`)

`PUBLIC_DATA_SERVICE_KEY`만 있으면 파일 없이 API로 적재한다. B554287 서비스의 `getDisConvFaclList`(좌표 포함 목록) + `getFacInfoOpenApiJpEvalInfoList`(시설별 features).

```bash
# 기본(features 생략, 일반 B등급): 3페이지 적재
corepack pnpm run ingest:api
# features까지(A/B 정밀): eval 호출 수 지정 — 개발계정 100콜/일 주의
PUBLIC_DATA_EVAL_LIMIT=50 corepack pnpm run ingest:api
```

⚠️ 제약: (1) 목록에 **지역 필터가 없어** 전국 ID 순으로 페이징됨(특정 지역만 받기 어려움), (2) features는 시설마다 eval 1콜 필요, (3) 개발계정 **100콜/일**. → 전국 정밀 적재는 **파일 다운로드(방법 A)** 가 유리하고, 대량 적재 시 운영계정(자동승인) 권장. 제어 env는 `.env.example`의 `PUBLIC_DATA_*` 참고.

## 남은 작업 (다음 세션 후보)

- [ ] 실제 공공데이터 **대량 적재** + 커버리지 확대(전국) → Google 호출 자연 감소
- [ ] 공중화장실(→B 보조): 표준데이터 좌표 2025.2 중단 → 주소 geocoding 필요
- [x] data.go.kr **OpenAPI 직접 연동 완료** (`getDisConvFaclList` + eval → `pnpm run ingest:api`). 남은 개선: 지역 필터 파라미터 확인, 대량 적재용 운영계정
- [ ] 문화/관광/박물관 fallback loader 실연동 (`KTO_SERVICE_KEY`, `CULTURE_BIGDATA_API_KEY`)
- [ ] MCP 서버 배포 + PlayMCP 콘솔 등록 (예선 제출)
- [ ] `get_accessibility_detail`, `find_nearby_support_facilities` tool 구현
- [ ] (논의) Google fallback 게이트 기준: 현행 A/B → "확인된 근거(A/B/C) 유무"로 완화할지

## Windows 주의

- Git Bash에서 `node`/`pnpm`이 PATH에 없으면 새 터미널을 열거나 PATH 추가
- pnpm은 `corepack pnpm ...` 또는 `npm i -g pnpm`
- `.env`, `data/*.db`, `data/raw/*`(예시 제외)는 gitignore → 커밋 안 됨
