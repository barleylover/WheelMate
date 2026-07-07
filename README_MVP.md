# 서초구 이동 전 체크리스트 MVP

장애인/휠체어 이용자가 외출 전에 확인해야 하는 항목을 자동 점검하는 로컬 CLI MVP입니다.

## 입력 데이터

- `C:/Users/0woo.DESKTOP-KHUF7OG/Downloads/서울특별시 서초구_무장애가게 현황_20240801.csv`
- `C:/Users/0woo.DESKTOP-KHUF7OG/Downloads/서울시 공중화장실 위치정보.csv`
- `C:/Users/0woo.DESKTOP-KHUF7OG/Downloads/서울특별시 서초구_장애인 편의시설현황_20250918.csv`
- `E:/wheel/api_key.env`

`api_key.env`에는 `KAKAO_REST_API_KEY=...` 형식의 카카오 REST API 키가 필요합니다.

## 실행 예시

가장 쉬운 방법은 `checklist.cmd` 실행파일을 쓰는 것입니다.

```cmd
cd /d E:\wheel
checklist.cmd "양재역 근처에서 휠체어로 갈 만한 카페 추천해줘"
```

질문 없이 `checklist.cmd`만 실행하면 프롬프트에서 질문을 입력할 수 있습니다. 더 많은 예시는 `USAGE_EXAMPLES.md`를 참고하세요.

직접 Python으로 실행하려면 다음처럼 실행합니다.

```powershell
& 'C:\Users\0woo.DESKTOP-KHUF7OG\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' `
  .\previsit_checklist.py "양재역 근처에서 휠체어로 갈 만한 카페 추천해줘" `
  --top 4 `
  --radius 900 `
  --facility-radius 500 `
  --output outputs\yangjae_cafe_checklist.md
```

일반 `python` 명령이 Windows 스토어 스텁으로 잡히면 위처럼 번들 Python을 사용하세요.

## 현재 체크 항목

- 장소 접근성: 1층, 엘리베이터, 입구턱, 경사로, 테이블석, 내부 장애인화장실, 내부 화장실 턱/문턱
- 이동 동선: 기준 위치 좌표, 목적지 직선거리, 주변 장애인용 승강기 후보
- 화장실: 목적지 주변 및 기준 위치 주변 장애인화장실 후보
- 차량/주차: 가게 주차장/장애인주차장, 주변 장애인 주차장 후보
- 영업/전화 확인: 영업시간 문자열, 전화번호, 방문 전 확인 질문
- 대체 후보: 같은 카테고리 내 접근성 점수 상위 후보

## 생성 파일

- `outputs/yangjae_cafe_checklist.md`: 샘플 체크리스트
- `seocho_disabled_facilities_geocoded.csv`: 서초구 장애인 편의시설 주소를 카카오 API로 좌표 변환한 캐시

## 한계

- 실제 보행 경로가 아니라 직선거리 기준입니다.
- 보도 경사, 공사, 턱, 엘리베이터 고장 여부는 판정하지 않습니다.
- 영업 여부는 문자열 기반 보수 판정입니다. 실시간 영업 상태 확정은 전화 확인이 필요합니다.
- 역 내부 상세 동선은 서울교통공사 교통약자 엘리베이터/빠른하차 API를 추가하면 개선할 수 있습니다.
