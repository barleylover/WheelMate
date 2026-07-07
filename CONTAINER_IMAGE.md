# 컨테이너 이미지 배포 안내

이 프로젝트는 MCP stdio 서버 컨테이너로 배포할 수 있습니다.

## 등록 UI 입력값

첨부된 등록 화면 기준으로 아래 값을 넣으면 됩니다. 실제 값은 사용하는 레지스트리에 맞게 바꾸세요.

### GitHub Container Registry 예시

- Registry 호스트: `ghcr.io`
- Registry 사용자: GitHub 사용자명 또는 토큰 사용자명
- Registry 비밀번호: GitHub PAT 또는 배포용 토큰
- image_name: `<github-user-or-org>/seocho-accessibility-mcp`
- image_tag: `0.1.0`
- 레지스트리 TLS 검증 해제: 체크하지 않음

### Docker Hub 예시

- Registry 호스트: `docker.io`
- Registry 사용자: Docker Hub 사용자명
- Registry 비밀번호: Docker Hub access token
- image_name: `<dockerhub-user>/seocho-accessibility-mcp`
- image_tag: `0.1.0`
- 레지스트리 TLS 검증 해제: 체크하지 않음

### 사설 Harbor 예시

- Registry 호스트: `harbor.example.com`
- Registry 사용자: Harbor 사용자명
- Registry 비밀번호: Harbor 비밀번호 또는 robot token
- image_name: `<project>/seocho-accessibility-mcp`
- image_tag: `0.1.0`
- 레지스트리 TLS 검증 해제: 사내 self-signed/insecure registry일 때만 체크

## 빌드

Docker Desktop 또는 Docker CLI가 설치된 환경에서 실행합니다.

```cmd
cd /d E:\wheel
build_image.cmd ghcr.io your-github-user/seocho-accessibility-mcp 0.1.0
```

직접 명령으로 실행하려면:

```cmd
docker build -t ghcr.io/your-github-user/seocho-accessibility-mcp:0.1.0 .
```

## 푸시

먼저 로그인합니다.

```cmd
docker login ghcr.io
```

그 다음 푸시합니다.

```cmd
push_image.cmd ghcr.io your-github-user/seocho-accessibility-mcp 0.1.0
```

직접 명령으로 실행하려면:

```cmd
docker push ghcr.io/your-github-user/seocho-accessibility-mcp:0.1.0
```

## 런타임 환경변수

이미지에는 API 키가 포함되지 않습니다. MCP 실행 환경에서 아래 환경변수를 주입해야 합니다.

- `KAKAO_REST_API_KEY`: 필수. 카카오 Local REST API 키
- `MAX_NEW_GEOCODES`: 선택. 기본값 `0`. 컨테이너에서는 포함된 geocode cache만 쓰는 것을 권장

이미지 내부 기본 데이터 경로:

- `/app/data/seocho_accessible_stores.csv`
- `/app/data/seoul_public_toilets.csv`
- `/app/data/seocho_disabled_facilities.csv`
- `/app/data/seocho_disabled_facilities_geocoded.csv`

## 로컬 실행 테스트

이미지를 빌드한 뒤 MCP stdio 프로세스로 실행합니다.

```cmd
docker run -i --rm ^
  -e KAKAO_REST_API_KEY=your_kakao_rest_api_key ^
  ghcr.io/your-github-user/seocho-accessibility-mcp:0.1.0
```

일반 터미널에서 직접 대화하기는 어렵습니다. MCP framed JSON-RPC를 쓰기 때문입니다.
Docker 없이 로컬 서버만 검증하려면 다음을 사용하세요.

```cmd
python mcp_smoke_test.py
python mcp_smoke_test.py --call
```

## 노출되는 MCP tool

도구 이름:

```text
seocho_previsit_checklist
```

입력 예:

```json
{
  "query": "방배역 근처 음식점 추천 좀. 쌀국수가 땡겨",
  "radius": 900,
  "facility_radius": 500,
  "top": 4
}
```

반환값은 Markdown 체크리스트입니다.

## 현재 포함 데이터

이미지에 포함되는 데이터는 `data/` 폴더의 CSV입니다.

- 서초구 무장애가게 현황
- 서울시 공중화장실 위치정보
- 서초구 장애인 편의시설현황
- 서초구 장애인 편의시설 geocode cache

API 키 파일인 `api_key.env`, `api_key.txt`는 `.dockerignore`로 제외했습니다.
