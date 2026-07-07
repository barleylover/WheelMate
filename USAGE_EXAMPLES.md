# 실행파일 사용법과 입력 예시

`cmd` 또는 PowerShell에서 `E:\wheel` 폴더로 이동한 뒤 실행합니다.

```cmd
cd /d E:\wheel
checklist.cmd "양재역 근처에서 휠체어로 갈 만한 카페 추천해줘"
```

질문 없이 실행하면 프롬프트가 뜹니다.

```cmd
cd /d E:\wheel
checklist.cmd
```

실행이 끝나면 결과를 읽을 수 있도록 `아무 키나 누르면 종료` 상태로 멈춥니다.

도움말은 다음처럼 볼 수 있습니다.

```cmd
checklist.cmd --help
```

## 가능한 기능

- 서초구 무장애가게 데이터에서 카페/음식점/전체 장소 후보 검색
- `쌀국수`, `베트남`, `버거`, `초밥`, `돈가스`, `냉면`, `분식` 같은 세부 음식 의도 우선 반영
- 카카오 Local API로 기준 위치 좌표 확인
- 기준 위치에서 목적지까지 직선거리 계산
- 접근성 점수 기반 1순위 장소 추천
- 대체 후보 자동 출력
- 장소 접근성 체크
  - 1층 여부
  - 1층이 아니면 엘리베이터 여부
  - 입구턱 여부
  - 경사로 여부
  - 테이블석 여부
  - 내부 장애인화장실 여부
  - 내부 화장실 턱/문턱 정보
- 이동 동선 체크
  - 가장 가까운 기준 위치
  - 목적지까지 거리
  - 주변 장애인용 승강기 후보
  - 실제 보행거리/경사/공사 여부는 데이터 한계로 확인 필요 표시
- 화장실 체크
  - 목적지 주변 장애인화장실 후보
  - 기준 위치 주변 장애인화장실 후보
- 차량/주차 체크
  - 가게 주차장 여부
  - 가게 장애인주차장 여부
  - 주변 장애인 주차장 후보
- 영업/전화 확인 체크
  - 영업시간 데이터 존재 여부
  - 휴무/24시간/정형 시간 문자열 보수 판정
  - 전화번호 존재 여부
- 방문 전 전화 질문 자동 생성
- Markdown 파일로 결과 저장

## 기본 입력 예시

```cmd
checklist.cmd "양재역 근처에서 휠체어로 갈 만한 카페 추천해줘"
```

```cmd
checklist.cmd "강남역 근처에서 휠체어로 갈 만한 음식점 추천해줘"
```

```cmd
checklist.cmd "교대역 주변 카페 중 입구턱 없는 곳 알려줘"
```

```cmd
checklist.cmd "방배역 근처에서 휠체어로 갈 만한 식당 추천해줘"
```

```cmd
checklist.cmd "방배역 근처 음식점 추천 좀. 쌀국수가 땡겨"
```

```cmd
checklist.cmd "고속터미널역 근처에서 장애인화장실 가까운 카페 추천해줘"
```

## 옵션을 함께 쓰는 예시

카테고리를 직접 지정합니다.

```cmd
checklist.cmd "양재역 근처 추천해줘" --category 카페
```

```cmd
checklist.cmd "서초구청 근처 추천해줘" --category 음식점
```

위치를 직접 지정합니다. 질문 파싱이 애매할 때 유용합니다.

```cmd
checklist.cmd "휠체어로 갈 만한 카페 추천해줘" --location 양재역 --category 카페
```

장소 후보 반경을 넓힙니다.

```cmd
checklist.cmd "양재역 근처 카페 추천해줘" --radius 1500
```

화장실/주차장/승강기 검색 반경을 넓힙니다.

```cmd
checklist.cmd "양재역 근처 카페 추천해줘" --facility-radius 800
```

대체 후보를 더 많이 봅니다.

```cmd
checklist.cmd "양재역 근처 카페 추천해줘" --top 6
```

결과를 Markdown 파일로 저장합니다.

```cmd
checklist.cmd "양재역 근처 카페 추천해줘" --output outputs\yangjae_cafe.md
```

새 좌표 변환 없이 기존 캐시만 사용합니다. 빠른 재실행에 좋습니다.

```cmd
checklist.cmd "양재역 근처 카페 추천해줘" --max-new-geocodes 0
```

## 공모전 데모용 추천 실행

```cmd
checklist.cmd "양재역 근처에서 휠체어로 갈 만한 카페 추천해줘" --top 4 --radius 900 --facility-radius 500 --output outputs\demo_yangjae_cafe.md
```

```cmd
checklist.cmd "교대역 근처에서 휠체어로 갈 만한 음식점 추천해줘" --category 음식점 --top 5 --radius 1200 --facility-radius 700 --output outputs\demo_gyodae_food.md
```

```cmd
checklist.cmd "고속터미널역 근처에서 장애인화장실 가까운 카페 추천해줘" --category 카페 --top 5 --radius 1500 --facility-radius 800 --output outputs\demo_terminal_cafe.md
```

## 주요 옵션

- `--location`: 기준 위치를 직접 지정합니다.
- `--category`: `카페`, `음식점`, `전체` 등을 직접 지정합니다.
- `--radius`: 장소 후보 검색 반경입니다. 기본값은 `900`m입니다.
- `--facility-radius`: 화장실/주차장/승강기 후보 검색 반경입니다. 기본값은 `500`m입니다.
- `--top`: 추천 1개와 대체 후보 목록 개수를 조절합니다. 기본값은 `4`입니다.
- `--output`: 결과를 Markdown 파일로 저장합니다.
- `--max-new-geocodes`: 서초구 편의시설 주소를 새로 좌표 변환할 최대 개수입니다. `0`이면 기존 캐시만 씁니다.
