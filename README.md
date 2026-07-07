# WheelMate

WheelMate는 휠체어 이용자가 현재 위치 주변에서 접근성 근거가 확인된 카페, 음식점, 문화시설, 박물관, 장애인 화장실, 전동휠체어 급속충전기 정보를 빠르게 확인할 수 있도록 돕는 MCP 서버입니다.

- GitHub 협업 레포지토리: https://github.com/barleylover/WheelMate
- 대회명: 카카오 AGENTIC PLAYER 10 / PlayMCP
- 공식 페이지: https://b.kakao.com/views/PlayMCP/AGENTIC_PlAYER_10
- 이전 수상작 및 참고 페이지: https://tech.kakao.com/posts/818

## MVP 범위

1차 구현은 예선 제출 안정성을 우선합니다.

- `recommend_accessible_places` MCP tool
- Kakao Local API 기반 위치 해석 및 주변 장소 후보 검색
- Google Places API New `accessibilityOptions` 보조 근거 수집
- OpenStreetMap Overpass `wheelchair` 태그 보조 근거 수집
- SQLite schema 및 공공데이터 loader skeleton
- 접근성 등급/점수화/한국어 요약 response builder
- 기본 테스트

공공데이터 loader는 현재 인터페이스와 raw file 기반 샘플 loader까지 포함합니다. 실제 공공데이터 API endpoint별 완전 연동은 다음 iteration에서 확장합니다.

## 설치

Node.js 24 이상을 권장합니다. Node 런타임에서 내장 `node:sqlite`를 사용할 수 없으면 서버는 로컬 공공데이터 DB만 비활성화하고 나머지 추천 흐름은 계속 동작합니다.

```bash
pnpm install
```

일반 Node.js 환경에서는 같은 package scripts를 `npm run ...` 형태로 실행할 수 있습니다.

## 환경 변수

`.env.example`을 참고해 `.env`를 만듭니다. 실제 API key는 커밋하지 않습니다.

```bash
KAKAO_REST_API_KEY=
GOOGLE_MAPS_API_KEY=
PUBLIC_DATA_SERVICE_KEY=
KTO_SERVICE_KEY=
CULTURE_BIGDATA_API_KEY=
USE_GOOGLE_PLACES=true
GOOGLE_FALLBACK_ONLY=true
USE_OSM=true
DEFAULT_RADIUS_M=1000
DEFAULT_LIMIT=3
DB_PATH=./data/accessibility.db
```

키가 없거나 일부 API가 실패해도 서버 전체가 종료되지 않고, 해당 출처는 `source_status`에 `disabled` 또는 `unavailable`로 표시됩니다.

Google Places(New) `accessibilityOptions`는 유료 SKU이므로 `GOOGLE_FALLBACK_ONLY=true`(기본값)에서는 로컬(Kakao/OSM/공공데이터) 근거만으로 상위 후보에 매장·건물 단위(A/B 등급) 접근성이 확인되지 않을 때에만 fallback으로 호출하고, 응답은 `api_cache`에 캐시합니다. 매 요청마다 호출하려면 `GOOGLE_FALLBACK_ONLY=false`로 둡니다.

## 실행

```bash
pnpm run dev
pnpm run build
pnpm run start
pnpm run ingest
pnpm test
```

로컬에서 MCP 프로토콜 없이 추천 JSON만 확인하려면:

```bash
pnpm run dev -- --sample
```

## MCP Tool

### recommend_accessible_places

사용자 위치와 카테고리를 받아 접근성 정보가 확인된 정도를 기준으로 주변 장소를 추천합니다.

입력 예시:

```json
{
  "query": "나 지금 홍대입구역인데 휠체어로 들어갈 수 있는 카페 추천해줘",
  "location": "홍대입구역",
  "category": "cafe",
  "radius_m": 1000,
  "limit": 3,
  "preferences": ["장애인화장실", "입구중요"]
}
```

출력에는 다음 정보가 포함됩니다.

- `query_interpretation`
- `origin`
- `recommendations[].accessibility_grade`
- `recommendations[].score`
- `recommendations[].confirmed_accessibility`
- `recommendations[].unknown_or_unverified`
- `recommendations[].cautions`
- `recommendations[].links.kakao_map`
- `recommendations[].links.kakao_route`
- `recommendations[].attribution`
- `source_status`
- `message_for_user`

등급 기준:

- A: 매장 단위 접근성 확인. 예: Google `wheelchairAccessibleEntrance=true`, OSM `wheelchair=yes`
- B: 건물/시설 단위 접근성 확인. 예: BF 인증, 장애인편의시설 데이터 매칭
- C: 주변 보조 편의시설만 확인. 예: 장애인 화장실, 전동휠체어 급속충전기
- D: 접근성 정보 미확인

Google Places의 값이 누락된 경우 `false`로 간주하지 않고 미확인으로 처리합니다.

## 데이터 수집 및 적재

SQLite 기본 경로는 `DB_PATH=./data/accessibility.db`입니다.

raw loader 는 `data/raw/` 의 파일을 읽어 SQLite 에 적재합니다. `PUBLIC_DATA_SERVICE_KEY` 로 data.go.kr 에서
각 표준데이터를 **JSON 또는 CSV(그리드 탭)** 로 내려받아 아래 파일명으로 저장하면 됩니다. (CSV 는 UTF-8/EUC-KR 자동 처리)

건물·시설 단위 접근성 → 후보에 매칭되어 **A/B 등급** 부여:

| 파일명(둘 중 하나) | 데이터 | 매칭 시 등급 |
| --- | --- | --- |
| `disability_facilities.json` / `.csv` | 전국장애인편의시설표준데이터(15100058) | B (경사로·승강기·장애인화장실 등), 컬럼에 BF 있으면 A |
| `social_security_disability_facilities.json` / `.csv` | 한국사회보장정보원 장애인편의시설 현황 | B |
| `bf_kead.json` / `.csv` | 한국장애인고용공단 BF 인증 시설 | A (전 레코드 BF 인증) |
| `bf_koddi.json` / `.csv` | 한국장애인개발원 BF 인증 정보 | A (전 레코드 BF 인증) |
| `gyeonggi_disability_facilities.json` / `.csv` | 경기도 경기공유 장애인시설 | B |

보조 편의시설 → 주변 500m 조회(화장실은 B, 충전기는 점수 가산):

- `public_restrooms.json` / `.csv` — 전국공중화장실표준데이터(15012892) ※2025.2 좌표 제공 중단, 좌표 포함 파일 필요
- `wheelchair_chargers.json` / `.csv` — 전국전동휠체어급속충전기표준데이터(15034533)

> `disability_facilities.example.json` 는 형식/자체검증용 예시입니다. 실제 데이터로 교체 전까지는
> 접근성 근거를 지어내지 않도록 loader 가 자동으로 읽지 않습니다. 파이프라인을 바로 테스트하려면
> `cp data/raw/disability_facilities.example.json data/raw/disability_facilities.json && pnpm run ingest` 를 실행하세요.

건물 편의시설 파일이 인식하는 컬럼(한글 헤더 키워드 매칭): `시설명`, `소재지도로명주소`/`소재지지번주소`,
`위도`/`경도`, `주출입구접근로`(경사로), `승강기`, `장애인사용가능화장실`, `주출입구높이차이제거`,
`장애인전용주차구역`, `BF/무장애 인증여부`. 값은 `있음/설치/가능/개수>0` 이면 보유로 처리합니다.

보조 편의시설(화장실/충전기) 파일이 지원하는 최소 컬럼:

```json
{
  "name": "시설명",
  "address": "주소",
  "lat": 37.0,
  "lng": 127.0,
  "opening_hours": "운영시간",
  "phone": "전화번호"
}
```

적재:

```bash
pnpm run ingest
```

BF 인증·장애인편의시설·화장실·충전기 loader는 위 raw 파일을 실제로 적재합니다. 문화/관광 fallback(무장애 문화생활, 한국관광공사 무장애여행, 박물관/미술관)은 아직 loader skeleton(skip) 상태입니다.

건물 편의시설은 적재 후 추천 시 후보 장소와 **좌표·이름·주소로 매칭**되어 근거로 부여됩니다. 매칭이 약하면(weak) 신뢰도를 낮춰 참고 정보로만 처리하고 등급을 올리지 않습니다. Kakao 후보에 매칭되지 않는 건물 레코드는 추천에 노출되지 않습니다.

## 한계점

- WheelMate는 장소 접근성 근거 추천 서버이며, 휠체어 이동 경로 최적화를 제공하지 않습니다.
- 카카오맵 길찾기 URL은 단순 링크입니다.
- 접근성 데이터는 누락되거나 오래되었을 수 있습니다.
- Google Places 접근성 옵션은 한국 내 커버리지가 충분하지 않을 수 있습니다.
- BF 인증은 건물/시설 단위 근거이며, 개별 매장 내부 좌석 간격이나 문턱 상태를 보장하지 않습니다.
- 공공/지도 데이터 기준으로 확인된 정보이므로 방문 전 전화 확인을 권장합니다.

## PlayMCP 등록 주의사항

예선 제출 전 확인할 항목:

- 카카오클라우드에서 MCP 서버 Endpoint 생성
- PlayMCP 개발자 콘솔에 MCP 서버 등록
- 최종 제출용 등록 및 심사 요청
- 심사 통과 후 서버 공개 상태를 전체 공개로 변경
- 최종 제출은 1회이므로 `.env`, API key, README, 서버 응답을 최종 확인

## 팀 협업 주의사항

- API key, service key, secret 커밋 금지
- 기능별 브랜치 사용 권장. 예: `feat/accessibility-mcp-server`, `feat/wheelmate-mcp`
- 기존 팀원 작업물 덮어쓰기 금지
- 구현 후 변경 사항, 실행 방법, 테스트 결과, 남은 TODO를 PR 본문에 공유

## 남은 TODO

- `get_accessibility_detail` tool 구현
- `find_nearby_support_facilities` tool 구현
- 문화/관광 fallback(무장애 문화생활·무장애여행·박물관미술관) loader 실제 연동
- 공중화장실 좌표 미제공(2025.2~) 대응: 주소 geocoding cache 로 좌표 보강
- data.go.kr OpenAPI 직접 연동(현재는 파일 다운로드 방식) — 정확한 endpoint slug 확정 시 client 추가
- HTTP 또는 streamable HTTP transport 분리
