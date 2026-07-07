# WheelMate Review Search MCP

휠체어 이용자를 위한 MCP 서비스입니다.

WheelMate Review Search MCP is an AGENTIC PLAYER 10 / PlayMCP preliminary MVP for estimating wheelchair accessibility signals from live search results.

It combines Kakao Local place candidates with Naver Search API and Daum Search API result titles/snippets. The result is always framed as a **search-result-based reference signal**, not confirmed accessibility.

Repository for team collaboration: <https://github.com/barleylover/WheelMate>

## Competition

- AGENTIC PLAYER 10 official page: <https://b.kakao.com/views/PlayMCP/AGENTIC_PlAYER_10>
- Previous winners/reference page: <https://tech.kakao.com/posts/818>

For PlayMCP submission, create the MCP server endpoint in KakaoCloud, register it in the PlayMCP developer console, request review, and after approval set the server visibility to public. Final submission is one-time only, so verify configuration, keys, and tool behavior first.

## Runtime

Required local scripts:

```bash
npm run dev
npm run dev:http
npm run build
npm run start
npm run start:http
npm run ingest
npm run token:playmcp
npm test
```

This workspace was verified with the bundled Codex Node runtime and `pnpm`; the `package.json` scripts are npm-compatible.

`npm run dev` and `npm run start` run the stdio MCP server for local MCP clients.
`npm run dev:http` and `npm run start:http` run the remote Streamable HTTP MCP server for PlayMCP-style deployment.

## Environment

Copy `.env.example` and fill only local secrets in `.env`. Do not commit `.env`.

Required/optional variables:

- `KAKAO_REST_API_KEY`
- `NAVER_CLIENT_ID`
- `NAVER_CLIENT_SECRET`
- `PUBLIC_DATA_SERVICE_KEY`
- `KTO_SERVICE_KEY`
- `CULTURE_BIGDATA_API_KEY`
- `USE_NAVER_SEARCH=true|false`
- `USE_DAUM_SEARCH=true|false`
- `USE_REVIEW_SEARCH=true|false`
- `USE_NAVER_BLOG=true|false`
- `USE_NAVER_CAFE=true|false`
- `USE_NAVER_WEB=true|false`
- `USE_DAUM_BLOG=true|false`
- `USE_DAUM_CAFE=true|false`
- `USE_DAUM_WEB=true|false`
- `DEFAULT_RADIUS_M=1000`
- `DEFAULT_LIMIT=5`
- `MAX_PLACE_CANDIDATES=5`
- `MAX_REVIEW_SEARCH_CALLS=60`
- `SEARCH_RESULTS_PER_QUERY=3`
- `SEARCH_TIMEOUT_MS=3500`
- `PORT=8080`
- `HOST=0.0.0.0`
- `MCP_ALLOWED_HOSTS=` optional comma-separated host allow-list for deployment
- `DB_PATH=./data/accessibility.db`

If Naver or Kakao keys are missing, the server returns source-unavailable metadata instead of crashing.

## MCP Tools

## Remote HTTP MCP

The PlayMCP deployment target should use the HTTP server:

```bash
PORT=8080 npm run start:http
```

Endpoints:

- `GET /health`: deployment health check
- `GET /`: service summary
- `POST /mcp`: stateless MCP Streamable HTTP endpoint

Local development:

```bash
pnpm run dev:http
```

Then register the deployed URL ending in `/mcp` in the PlayMCP developer console, for example:

```text
https://your-deployed-domain.example/mcp
```

Do not register the PlayMCP detail page URL as the endpoint. PlayMCP needs the actual remote MCP server endpoint.

If the deployment platform cannot inject runtime environment variables, use PlayMCP `Key/token` authentication and generate a token from your local `.env`:

```bash
pnpm run token:playmcp
```

Treat the generated value as a secret. In PlayMCP server registration, choose `Key/token authentication` and paste the generated value as the token. The HTTP server reads that bearer token per request and uses it as request-scoped Kakao/Naver API configuration. Do not paste this token into GitHub, README files, issue comments, or chat logs.

Docker build:

```bash
docker build -t wheelmate-review-search-mcp .
docker run --env-file .env -p 8080:8080 wheelmate-review-search-mcp
```

GitHub Container Registry image registration values after the GitHub Actions workflow succeeds:

```text
Registry host: ghcr.io
image_name: barleylover/wheelmate
image_tag: review-search-mcp
```

If the package is private, enter a GitHub username and a token with package read permission in the registry credential fields. If the package is public, leave the registry credential fields empty.

### `recommend_accessible_places_by_review_search`

Finds nearby candidates with Kakao Local, searches review/web snippets, extracts accessibility signals, and returns ranked recommendations.

The recommendation flow uses two candidate paths:

- broad review discovery: searches queries like `사당역 카페 휠체어`, extracts likely place names from search-result titles/snippets, then verifies those places with Kakao Local
- local candidate verification: gets nearby places from Kakao Local first, then searches each place for accessibility signals

Broad discovery is intentionally limited to API-provided search result metadata. It does not crawl full blog/cafe bodies.

Input example:

```json
{
  "query": "홍대입구역 근처 휠체어로 들어갈 수 있는 카페 추천해줘",
  "location": "홍대입구역",
  "category": "cafe",
  "radius_m": 800,
  "limit": 5,
  "preferences": ["입구중요", "장애인화장실"]
}
```

Output includes:

- `query_interpretation`
- `origin`
- `ranking_policy`
- `recommendations`
- `not_recommended_places`
- `unverified_candidates`
- `fallback_used`
- `message_for_user`

### `search_place_accessibility_reviews`

Searches one place across enabled review/web sources and returns extracted signals.

Input example:

```json
{
  "place_name": "A카페",
  "address": "서울 마포구 ...",
  "neighborhood": "홍대입구",
  "category": "cafe",
  "limit": 5
}
```

### `find_nearby_support_facilities`

Finds nearby accessible public restrooms and electric wheelchair chargers from the local SQLite support-facility table.

Input example:

```json
{
  "location": "홍대입구역",
  "type": "all",
  "radius_m": 800,
  "limit": 5
}
```

## Search APIs

The review signal path can use six sources:

- Naver blog: `https://openapi.naver.com/v1/search/blog.json`
- Naver cafe articles: `https://openapi.naver.com/v1/search/cafearticle.json`
- Naver web documents: `https://openapi.naver.com/v1/search/webkr.json`
- Daum blog: `https://dapi.kakao.com/v2/search/blog`
- Daum cafe: `https://dapi.kakao.com/v2/search/cafe`
- Daum web: `https://dapi.kakao.com/v2/search/web`

Only API-provided title/description/contents snippets are used. Blog/cafe body crawling, login bypass, unofficial APIs, cookies, and scraping are not used.

## Storage Rules

SQLite is used for public/support data and geocoding support only.

Tables:

- `places`
- `public_accessibility_evidence`
- `support_facilities`
- `geocode_cache`
- `api_health_log`

There is intentionally no persistent table for raw Naver/Daum search responses. Search result `title`, `description`, `contents`, and `link` values are not stored in SQLite and are not logged.

Run schema setup:

```bash
npm run ingest
```

Public-data ingestion reads optional CSV files from `data/import/` and stores official/support evidence in SQLite. Missing files are skipped, so search-only operation still works.

Supported import filenames:

- `bf_kead.csv`: 한국장애인고용공단 BF 인증 시설 정보
- `bf_koddi.csv`: 한국장애인개발원 장애물없는생활환경인증 정보
- `disability_facilities_standard.csv`: 전국장애인편의시설표준데이터
- `social_security_disability_facilities.csv`: 한국사회보장정보원 장애인편의시설 현황
- `public_restrooms.csv`: 전국공중화장실표준데이터
- `wheelchair_chargers.csv`: 전국전동휠체어급속충전기표준데이터
- `culture_barrier_free.csv`: 장애인/베리어프리 문화생활 정보
- `gyeonggi_shared_disability_facilities.csv`: 경기도 경기공유 장애인시설
- `kto_barrier_free_travel.csv`: 한국관광공사 무장애 여행 정보
- `museum_standard.csv`: 전국박물관미술관정보표준데이터

After adding one or more CSV files:

```bash
npm run ingest
```

The recommendation tool then matches public evidence by coordinates, name, and address, and shows it separately from review-search evidence.

## Review Signal Grades

- `R1`: strong positive review signal, or positive signals from multiple results/sources, with no strong negative.
- `R2`: weak positive signal such as stroller proxy, wide entrance, or elevator mention.
- `R3`: accessibility-related mention exists but is unclear.
- `R4`: no useful accessibility signal.
- `W`: strong negative, repeated negative, or strongly conflicting evidence. These go to `not_recommended_places`.

The service separates:

- 후기 기반 접근성 신호
- 공공데이터 기반 보조 근거
- 확인되지 않은 정보

It does not present search signals as confirmed accessibility and does not provide wheelchair-optimized routing.

## Ranking Policy

Primary order:

```text
R1 > R2 > O1 > R3 > O2 > R4
```

Then:

1. higher `review_signal_score`
2. shorter distance

`W` places are excluded from recommendations. `R4` places are excluded by default and returned as unverified candidates unless the user asks to show candidates even without evidence.

## Limitations

- Search results are based on title/snippet fields, not full blog or cafe body text.
- Private or member-only cafe/blog posts are not accessible.
- Search results may reflect subjective or outdated experiences.
- Store layout, threshold height, interior aisle width, crowding, and current operating status are not verified.
- BF certification is building/facility-level evidence and does not prove every seat or entrance is wheelchair-friendly.
- This server does not compute wheelchair-optimized routes. Kakao Map links are simple map/route links.
- Users should call the venue before visiting.

## Collaboration Notes

- Never commit API keys or `.env`.
- Prefer feature branches such as `feat/review-search-mcp` or `feat/wheelmate-review-search`.
- Keep changes scoped and reviewable.
- Do not overwrite teammate work without discussion.
- Share changed files, run commands, test results, and remaining TODOs after implementation.
