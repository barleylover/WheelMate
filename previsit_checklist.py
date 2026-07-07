import argparse
import csv
import json
import math
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any


WORKDIR = Path(__file__).resolve().parent
DOWNLOADS = Path.home() / "Downloads"

DEFAULT_STORE_CSV = DOWNLOADS / "서울특별시 서초구_무장애가게 현황_20240801.csv"
DEFAULT_TOILET_CSV = DOWNLOADS / "서울시 공중화장실 위치정보.csv"
DEFAULT_FACILITY_CSV = DOWNLOADS / "서울특별시 서초구_장애인 편의시설현황_20250918.csv"
DEFAULT_ENV = WORKDIR / "api_key.env"
DEFAULT_GEOCODE_CACHE = WORKDIR / "seocho_disabled_facilities_geocoded.csv"

KAKAO_LOCAL_BASE = "https://dapi.kakao.com/v2/local"

FOOD_PREFERENCES = {
    "쌀국수": (
        "쌀국수",
        "베트남",
        "베트남식",
        "베트남요리",
        "동남아",
        "동남아시아",
        "에머이",
        "미스사이공",
        "포몬스",
        "분분",
        "르사이공",
        "인더비엣",
        "띤띤",
    ),
    "베트남": (
        "쌀국수",
        "베트남",
        "베트남식",
        "베트남요리",
        "동남아",
        "동남아시아",
        "에머이",
        "미스사이공",
        "포몬스",
        "분분",
        "르사이공",
        "인더비엣",
        "띤띤",
    ),
    "버거": ("버거", "햄버거", "맥도날드", "노브랜드버거", "번패티번"),
    "초밥": ("초밥", "스시", "일식 회/초밥"),
    "돈가스": ("돈가스", "돈까스", "카레/돈가스"),
    "냉면": ("냉면", "밀면"),
    "분식": ("분식", "김밥", "만두", "떡볶이"),
}


def read_text_auto(path: Path) -> str:
    data = path.read_bytes()
    for encoding in ("utf-8-sig", "cp949", "euc-kr", "utf-8"):
        try:
            return data.decode(encoding)
        except UnicodeDecodeError:
            continue
    return data.decode("utf-8", errors="replace")


def read_csv_auto(path: Path) -> list[dict[str, str]]:
    text = read_text_auto(path)
    lines = text.splitlines()
    if not lines:
        return []
    reader = csv.DictReader(lines)
    return [{k: (v or "").strip() for k, v in row.items()} for row in reader]


def write_csv(path: Path, rows: list[dict[str, Any]], fieldnames: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def load_env_key(env_path: Path) -> str:
    env_key = os.environ.get("KAKAO_REST_API_KEY", "").strip()
    if env_key:
        return env_key
    if not env_path.exists():
        raise SystemExit(f"API key env file not found: {env_path}")
    for raw_line in env_path.read_text(encoding="utf-8-sig").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        name, value = line.split("=", 1)
        if name.strip() == "KAKAO_REST_API_KEY":
            return value.strip().strip("\"'")
    raise SystemExit(f"KAKAO_REST_API_KEY not found in {env_path}")


def to_float(value: Any) -> float | None:
    try:
        number = float(str(value).strip())
    except (TypeError, ValueError):
        return None
    if not math.isfinite(number):
        return None
    return number


def distance_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius = 6_371_000.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = (
        math.sin(dphi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    )
    return 2 * radius * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def yn(value: str) -> str:
    value = (value or "").strip().upper()
    if value in {"Y", "YES", "TRUE", "1"}:
        return "Y"
    if value in {"N", "NO", "FALSE", "0"}:
        return "N"
    return ""


def status_line(status: str, text: str) -> str:
    labels = {
        "OK": "가능",
        "확인 가능": "가능",
        "주의": "주의",
        "확인 필요": "확인 필요",
        "부적합 가능": "부적합 가능",
        "대체": "대체 후보",
        "부분 확인": "부분 확인",
    }
    return f"[{labels.get(status, status)}] {text}"


def normalize_space(value: str) -> str:
    return re.sub(r"\s+", " ", (value or "").strip())


class KakaoLocalClient:
    def __init__(self, api_key: str, min_interval_sec: float = 0.03):
        self.api_key = api_key
        self.min_interval_sec = min_interval_sec
        self._last_call = 0.0

    def get(self, path: str, params: dict[str, Any], retries: int = 3) -> dict[str, Any]:
        elapsed = time.time() - self._last_call
        if elapsed < self.min_interval_sec:
            time.sleep(self.min_interval_sec - elapsed)
        query = urllib.parse.urlencode(
            {key: value for key, value in params.items() if value not in (None, "")}
        )
        url = f"{KAKAO_LOCAL_BASE}/{path}.json?{query}"
        request = urllib.request.Request(
            url,
            headers={
                "Authorization": f"KakaoAK {self.api_key}",
                "User-Agent": "seocho-accessibility-mvp/0.1",
            },
        )
        last_error: Exception | None = None
        for attempt in range(retries):
            try:
                with urllib.request.urlopen(request, timeout=15) as response:
                    self._last_call = time.time()
                    return json.loads(response.read().decode("utf-8"))
            except Exception as exc:
                last_error = exc
                time.sleep(0.35 * (attempt + 1))
        raise RuntimeError(f"Kakao API request failed: {path} {params} ({last_error!r})")

    def keyword_search(
        self,
        query: str,
        category_group_code: str = "",
        x: float | None = None,
        y: float | None = None,
        radius: int | None = None,
        size: int = 10,
    ) -> list[dict[str, Any]]:
        params: dict[str, Any] = {"query": query, "size": size}
        if category_group_code:
            params["category_group_code"] = category_group_code
        if x is not None and y is not None:
            params.update({"x": x, "y": y})
        if radius:
            params["radius"] = radius
        return list(self.get("search/keyword", params).get("documents", []))

    def address_search(self, query: str) -> dict[str, Any] | None:
        docs = list(self.get("search/address", {"query": query, "size": 1}).get("documents", []))
        return docs[0] if docs else None


@dataclass
class Place:
    row: dict[str, str]
    name: str
    branch: str
    category_major: str
    category_mid: str
    category_minor: str
    dong: str
    address: str
    phone: str
    hours: str
    lat: float
    lon: float
    distance_m: float = 0.0
    score: float = 0.0
    score_reasons: tuple[str, ...] = ()

    @property
    def display_name(self) -> str:
        return f"{self.name} {self.branch}".strip()


def detect_preference(query: str) -> str:
    text = normalize_space(query).lower()
    for label, tokens in FOOD_PREFERENCES.items():
        if label.lower() in text or any(token.lower() in text for token in tokens):
            return label
    return ""


def row_search_text(row: dict[str, str]) -> str:
    return " ".join(
        row.get(key, "")
        for key in (
            "상호명",
            "지점명",
            "상권업종대분류명",
            "상권업종중분류명",
            "상권업종소분류명",
        )
    ).lower()


def row_matches_preference(row: dict[str, str], preference: str) -> bool:
    if not preference:
        return True
    tokens = FOOD_PREFERENCES.get(preference, (preference,))
    text = row_search_text(row)
    return any(token.lower() in text for token in tokens)


def row_matches_exact_preference(row: dict[str, str], preference: str) -> bool:
    if not preference:
        return False
    return preference.lower() in row_search_text(row)


def parse_query(
    query: str, explicit_location: str = "", explicit_category: str = ""
) -> tuple[str, str, str]:
    text = normalize_space(query)
    preference = detect_preference(text)
    category = explicit_category.strip()
    if not category:
        if "카페" in text or "커피" in text:
            category = "카페"
        elif preference or any(token in text for token in ("음식점", "식당", "맛집", "밥", "점심", "저녁")):
            category = "음식점"
        else:
            category = "전체"

    location = explicit_location.strip()
    if not location:
        patterns = [
            r"(.+?역)\s*(?:근처|주변|인근|에서)",
            r"(.+?)\s*(?:근처|주변|인근|에서)",
        ]
        for pattern in patterns:
            match = re.search(pattern, text)
            if match:
                location = match.group(1).strip(" \"'“”")
                break
    if not location:
        location = "서초구청"
    return location, category, preference


def resolve_location(client: KakaoLocalClient, location: str) -> dict[str, Any]:
    category = "SW8" if "역" in location else ""
    docs = client.keyword_search(location, category_group_code=category, size=10)
    if not docs and category:
        docs = client.keyword_search(location, size=10)
    if not docs:
        raise SystemExit(f"위치를 찾지 못했습니다: {location}")

    def rank(doc: dict[str, Any]) -> tuple[int, int]:
        address = (doc.get("road_address_name") or doc.get("address_name") or "")
        name = doc.get("place_name") or ""
        seocho_bonus = 0 if "서초구" in address else 1
        exact_bonus = 0 if location.replace(" ", "") in name.replace(" ", "") else 1
        return (seocho_bonus, exact_bonus)

    best = sorted(docs, key=rank)[0]
    return {
        "name": best.get("place_name") or location,
        "address": best.get("road_address_name") or best.get("address_name") or "",
        "lat": float(best["y"]),
        "lon": float(best["x"]),
        "raw": best,
    }


def category_matches(row: dict[str, str], category: str) -> bool:
    if category == "전체":
        return True
    fields = " ".join(
        row.get(key, "")
        for key in ("상권업종대분류명", "상권업종중분류명", "상권업종소분류명")
    )
    if category == "카페":
        return any(token in fields for token in ("카페", "커피", "제과", "도넛", "아이스크림", "비알코올"))
    if category == "음식점":
        return "음식점" in fields or any(
            token in fields
            for token in ("한식", "중식", "일식", "양식", "분식", "패스트푸드", "고기", "수산물")
        )
    return category in fields


def load_places(store_csv: Path, category: str, origin: dict[str, Any], radius_m: int) -> list[Place]:
    rows = read_csv_auto(store_csv)
    places: list[Place] = []
    for row in rows:
        if row.get("시군구명") != "서초구":
            continue
        if not category_matches(row, category):
            continue
        lat = to_float(row.get("위도"))
        lon = to_float(row.get("경도"))
        if lat is None or lon is None:
            continue
        dist = distance_m(origin["lat"], origin["lon"], lat, lon)
        if dist > radius_m:
            continue
        places.append(
            Place(
                row=row,
                name=row.get("상호명", ""),
                branch=row.get("지점명", ""),
                category_major=row.get("상권업종대분류명", ""),
                category_mid=row.get("상권업종중분류명", ""),
                category_minor=row.get("상권업종소분류명", ""),
                dong=row.get("행정동명", ""),
                address=row.get("도로명주소", ""),
                phone=row.get("전화번호", ""),
                hours=row.get("영업시간", ""),
                lat=lat,
                lon=lon,
                distance_m=dist,
            )
        )
    return places


def score_place(place: Place, preference: str = "") -> Place:
    score = 50.0
    reasons: list[str] = []
    first_floor = yn(place.row.get("일층"))
    ramp = yn(place.row.get("경사로"))
    entrance_step = yn(place.row.get("입구턱"))
    entrance_no_step = yn(place.row.get("입구문턱"))
    table = yn(place.row.get("테이블석"))
    disabled_toilet = yn(place.row.get("장애인화장실"))
    elevator = yn(place.row.get("엘리베이터"))
    parking = yn(place.row.get("주차장"))
    disabled_parking = yn(place.row.get("장애인주차장"))

    if place.distance_m <= 300:
        score += 20
        reasons.append("기준 위치에서 300m 이내")
    elif place.distance_m <= 600:
        score += 12
        reasons.append("기준 위치에서 600m 이내")
    elif place.distance_m <= 1000:
        score += 5
        reasons.append("기준 위치에서 1km 이내")
    else:
        score -= 8
        reasons.append("기준 위치에서 다소 멂")

    if first_floor == "Y":
        score += 18
        reasons.append("1층")
    elif elevator == "Y":
        score += 12
        reasons.append("1층은 아니지만 엘리베이터 있음")
    elif first_floor == "N":
        score -= 25
        reasons.append("1층 아님/엘리베이터 확인 필요")

    if entrance_step == "N":
        score += 16
        reasons.append("입구턱 없음")
    elif entrance_step == "Y":
        score -= 28
        reasons.append("입구턱 있음")

    if entrance_no_step == "Y":
        score += 6
    if ramp == "Y":
        score += 10
        reasons.append("경사로 있음")
    elif ramp == "N" and entrance_step == "Y":
        score -= 8

    if table == "Y":
        score += 8
        reasons.append("테이블석 있음")
    elif table == "N":
        score -= 8

    if disabled_toilet == "Y":
        score += 8
        reasons.append("내부 장애인화장실 있음")
    elif disabled_toilet == "N":
        score -= 2

    if disabled_parking == "Y":
        score += 8
        reasons.append("장애인주차장 있음")
    elif parking == "Y":
        score += 3
        reasons.append("일반 주차장 있음")

    if place.phone:
        score += 4
    if place.hours:
        score += 3

    if preference and row_matches_exact_preference(place.row, preference):
        score += 75
        reasons.append(f"{preference} 정확 일치 후보")
    elif preference and row_matches_preference(place.row, preference):
        score += 35
        reasons.append(f"{preference} 관련 후보")

    place.score = score
    place.score_reasons = tuple(reasons)
    return place


def load_toilets(toilet_csv: Path) -> list[dict[str, Any]]:
    toilets = []
    for row in read_csv_auto(toilet_csv):
        if row.get("구 명칭") != "서초구":
            continue
        disabled = row.get("장애인화장실 현황", "").strip()
        lat = to_float(row.get("y 좌표"))
        lon = to_float(row.get("x 좌표"))
        if not disabled or lat is None or lon is None:
            continue
        toilets.append({**row, "lat": lat, "lon": lon})
    return toilets


def nearest_toilets(
    toilets: list[dict[str, Any]], lat: float, lon: float, radius_m: int, limit: int = 3
) -> list[dict[str, Any]]:
    out = []
    for row in toilets:
        dist = distance_m(lat, lon, row["lat"], row["lon"])
        if dist <= radius_m:
            out.append({**row, "distance_m": dist})
    return sorted(out, key=lambda row: row["distance_m"])[:limit]


def facility_cache_key(row: dict[str, str]) -> str:
    return "\u241f".join(
        normalize_space(row.get(key, ""))
        for key in ("시설물 구분", "시설물명", "소재지 주소", "행정동")
    )


def load_facility_geocode_cache(cache_path: Path) -> dict[str, dict[str, str]]:
    if not cache_path.exists():
        return {}
    rows = read_csv_auto(cache_path)
    return {row.get("cache_key", ""): row for row in rows if row.get("cache_key")}


def geocode_facilities_for_dongs(
    client: KakaoLocalClient,
    facility_csv: Path,
    cache_path: Path,
    dongs: set[str],
    max_new_geocodes: int,
) -> list[dict[str, Any]]:
    rows = read_csv_auto(facility_csv)
    cache = load_facility_geocode_cache(cache_path)
    updated = False
    new_count = 0
    selected: list[dict[str, Any]] = []
    for row in rows:
        if dongs and row.get("행정동") not in dongs:
            continue
        key = facility_cache_key(row)
        cached = cache.get(key)
        if cached:
            lat = to_float(cached.get("lat"))
            lon = to_float(cached.get("lon"))
            status = cached.get("geocode_status", "")
        elif new_count < max_new_geocodes:
            query = row.get("소재지 주소", "")
            lat = lon = None
            status = "not_found"
            try:
                doc = client.address_search(query)
                if doc:
                    lat = to_float(doc.get("y"))
                    lon = to_float(doc.get("x"))
                    status = "ok" if lat is not None and lon is not None else "bad_coordinate"
            except Exception as exc:
                status = f"error:{exc.__class__.__name__}"
            cache[key] = {
                "cache_key": key,
                "시설물 구분": row.get("시설물 구분", ""),
                "시설물명": row.get("시설물명", ""),
                "소재지 주소": row.get("소재지 주소", ""),
                "행정동": row.get("행정동", ""),
                "lat": "" if lat is None else f"{lat:.8f}",
                "lon": "" if lon is None else f"{lon:.8f}",
                "geocode_status": status,
            }
            updated = True
            new_count += 1
        else:
            continue

        lat = to_float(cache.get(key, {}).get("lat")) if key in cache else lat
        lon = to_float(cache.get(key, {}).get("lon")) if key in cache else lon
        if lat is None or lon is None:
            continue
        selected.append({**row, "lat": lat, "lon": lon, "geocode_status": status})

    if updated:
        fields = [
            "cache_key",
            "시설물 구분",
            "시설물명",
            "소재지 주소",
            "행정동",
            "lat",
            "lon",
            "geocode_status",
        ]
        write_csv(cache_path, list(cache.values()), fields)
    return selected


def nearest_facilities(
    facilities: list[dict[str, Any]],
    lat: float,
    lon: float,
    radius_m: int,
    kind: str,
    limit: int = 3,
) -> list[dict[str, Any]]:
    out = []
    for row in facilities:
        if kind and row.get("시설물 구분") != kind:
            continue
        dist = distance_m(lat, lon, row["lat"], row["lon"])
        if dist <= radius_m:
            out.append({**row, "distance_m": dist})
    return sorted(out, key=lambda row: row["distance_m"])[:limit]


def open_status(hours: str, now: datetime | None = None) -> tuple[str, str]:
    hours = normalize_space(hours)
    if not hours:
        return "확인 필요", "영업시간 데이터 없음"
    if "24시간" in hours or re.search(r"00:00\s*[-~]\s*24:00", hours):
        return "확인 가능", "24시간 또는 종일 영업으로 표기됨"
    if "정기휴무" in hours or "휴무" in hours:
        return "주의", "휴무 표기가 있어 방문 전 확인 권장"
    if re.search(r"\d{1,2}:\d{2}\s*[-~]\s*\d{1,2}:\d{2}", hours):
        return "부분 확인", "영업시간 문자열은 있으나 자동 판정은 보수적으로 처리"
    return "부분 확인", "영업시간 설명은 있으나 정형 파싱 어려움"


def access_lines(place: Place) -> list[str]:
    row = place.row
    lines = []
    first_floor = yn(row.get("일층"))
    elevator = yn(row.get("엘리베이터"))
    entrance_step = yn(row.get("입구턱"))
    entrance_no_step = yn(row.get("입구문턱"))
    ramp = yn(row.get("경사로"))
    table = yn(row.get("테이블석"))
    restroom_step = yn(row.get("화장실턱"))
    restroom_no_step = yn(row.get("화장실문턱"))
    disabled_toilet = yn(row.get("장애인화장실"))

    if first_floor == "Y":
        lines.append(status_line("OK", "1층입니다."))
    elif first_floor == "N" and elevator == "Y":
        lines.append(status_line("OK", "1층은 아니지만 엘리베이터가 있습니다."))
    elif first_floor == "N":
        lines.append(status_line("주의", "1층이 아니며 엘리베이터 동선 확인이 필요합니다."))
    else:
        lines.append(status_line("확인 필요", "층수 정보가 없습니다."))

    if entrance_step == "N" or entrance_no_step == "Y":
        lines.append(status_line("OK", "입구턱 없음으로 기록되어 있습니다."))
    elif entrance_step == "Y":
        lines.append(status_line("부적합 가능", "입구턱 있음으로 기록되어 있습니다."))
    else:
        lines.append(status_line("확인 필요", "입구턱 정보가 없습니다."))

    if ramp == "Y":
        lines.append(status_line("OK", "경사로가 있습니다."))
    elif ramp == "N":
        lines.append(status_line("주의", "경사로 없음으로 기록되어 있습니다. 입구턱이 없으면 통행 가능할 수 있습니다."))
    else:
        lines.append(status_line("확인 필요", "경사로 정보가 없습니다."))

    if table == "Y":
        lines.append(status_line("OK", "테이블석이 있습니다."))
    elif table == "N":
        lines.append(status_line("주의", "테이블석 없음으로 기록되어 있습니다."))
    else:
        lines.append(status_line("확인 필요", "테이블석 정보가 없습니다."))

    if disabled_toilet == "Y":
        lines.append(status_line("OK", "내부 장애인화장실이 있습니다."))
    elif disabled_toilet == "N":
        lines.append(status_line("주의", "내부 장애인화장실 없음으로 기록되어 있습니다."))
    else:
        lines.append(status_line("확인 필요", "내부 장애인화장실 정보가 없습니다."))

    if restroom_step == "Y":
        lines.append(status_line("주의", "내부 화장실 턱 있음으로 기록되어 있습니다."))
    elif restroom_no_step == "Y":
        lines.append(status_line("OK", "내부 화장실 문턱 없음으로 기록되어 있습니다."))
    else:
        lines.append(status_line("확인 필요", "내부 화장실 턱/문턱 정보가 제한적입니다."))
    return lines


def parking_lines(place: Place, nearby_parking: list[dict[str, Any]]) -> list[str]:
    row = place.row
    lines = []
    parking = yn(row.get("주차장"))
    disabled_parking = yn(row.get("장애인주차장"))
    if disabled_parking == "Y":
        lines.append(status_line("OK", "가게 장애인주차장이 있습니다."))
    elif parking == "Y":
        lines.append(status_line("주의", "일반 주차장은 있으나 장애인주차장 여부는 불확실합니다."))
    else:
        lines.append(status_line("확인 필요", "가게 주차장/장애인주차장 정보가 없거나 없음으로 기록되어 있습니다."))
    if nearby_parking:
        for item in nearby_parking:
            lines.append(
                status_line(
                    "대체",
                    f"{item.get('시설물명')} 장애인 주차장 후보 약 {item['distance_m']:.0f}m",
                )
            )
    else:
        lines.append(status_line("확인 필요", "반경 내 별도 장애인 주차장 후보가 확인되지 않았습니다."))
    return lines


def phone_questions(place: Place) -> list[str]:
    row = place.row
    questions = [
        "입구에 턱이나 계단이 있나요? 있다면 높이가 어느 정도인가요?",
        "휠체어가 회전하거나 머물 수 있는 테이블석이 있나요?",
        "오늘 영업시간과 마지막 주문 시간이 어떻게 되나요?",
    ]
    if yn(row.get("경사로")) != "Y":
        questions.append("경사로가 없다고 되어 있는데, 입구턱 없이 바로 들어갈 수 있나요?")
    if yn(row.get("장애인화장실")) != "Y":
        questions.append("장애인화장실 또는 휠체어가 들어갈 만큼 넓은 화장실이 있나요?")
    if yn(row.get("장애인주차장")) != "Y":
        questions.append("차량 방문 시 장애인주차구역이나 가까운 주차 가능 공간이 있나요?")
    if not place.phone:
        questions.append("전화번호 데이터가 없어 지도/포털에서 연락처를 추가 확인해야 합니다.")
    return questions


def render_facility_list(items: list[dict[str, Any]], empty_text: str, label_field: str) -> list[str]:
    if not items:
        return [status_line("확인 필요", empty_text)]
    lines = []
    for item in items:
        name = item.get(label_field, "")
        address = item.get("도로명주소") or item.get("소재지 주소") or ""
        extra = item.get("개방시간") or item.get("시설물 구분") or ""
        lines.append(f"[가능] {name} 약 {item['distance_m']:.0f}m - {address} ({extra})")
    return lines


def render_checklist(
    query: str,
    origin: dict[str, Any],
    category: str,
    preference: str,
    intent_note: str,
    place: Place,
    alternatives: list[Place],
    toilets: list[dict[str, Any]],
    station_toilets: list[dict[str, Any]],
    nearby_parking: list[dict[str, Any]],
    nearby_elevators: list[dict[str, Any]],
    nearby_chargers: list[dict[str, Any]],
    radius_m: int,
) -> str:
    open_level, open_note = open_status(place.hours)
    recommendation = "추천 가능"
    if yn(place.row.get("입구턱")) == "Y" or (
        yn(place.row.get("일층")) == "N" and yn(place.row.get("엘리베이터")) != "Y"
    ):
        recommendation = "주의 후 추천"
    if place.score < 60:
        recommendation = "대체 후보 우선 검토"

    display_category = preference or category
    lines = [
        f"# {origin['name']} 근처 휠체어 이용 가능 {display_category} 이동 전 체크리스트",
        "",
        f"- 원문 질문: {query}",
        f"- 음식/장소 의도: {display_category}",
        f"- 후보 선택 방식: {intent_note}",
        f"- 추천 장소: {place.display_name}",
        f"- 주소: {place.address}",
        f"- 거리: {origin['name']} 기준 약 {place.distance_m:.0f}m",
        f"- 접근성 판단: {recommendation} (점수 {place.score:.1f})",
        f"- 전화번호: {place.phone or '정보 없음'}",
        f"- 영업시간: {place.hours or '정보 없음'}",
        "",
        "## 1. 장소 접근성",
        *[f"- {line}" for line in access_lines(place)],
        "",
        "## 2. 이동 동선",
        f"- [가능] 가장 가까운 기준 위치는 {origin['name']}입니다.",
        f"- [가능] 목적지까지 직선거리 기준 약 {place.distance_m:.0f}m입니다.",
        "- [주의] 현재 MVP는 직선거리 기준입니다. 실제 보행거리, 보도 경사, 공사 여부는 별도 보행 네트워크/현장 데이터가 필요합니다.",
        *[f"- {line}" for line in render_facility_list(nearby_elevators, "주변 장애인용 승강기 후보가 확인되지 않았습니다.", "시설물명")],
        "",
        "## 3. 화장실",
        *[f"- {line}" for line in render_facility_list(toilets, f"반경 {radius_m}m 내 장애인화장실 후보가 없습니다.", "건물명")],
    ]
    if station_toilets:
        lines.extend(["", "### 기준 위치 주변 화장실 후보"])
        lines.extend(f"- {line}" for line in render_facility_list(station_toilets, "", "건물명"))

    lines.extend(
        [
            "",
            "## 4. 차량/주차",
            *[f"- {line}" for line in parking_lines(place, nearby_parking)],
            "",
            "## 5. 영업/전화 확인",
            f"- {status_line(open_level, open_note)}",
            f"- {status_line('OK' if place.phone else '확인 필요', '전화번호 ' + ('있음' if place.phone else '없음'))}",
            "",
            "## 6. 방문 전 전화 질문",
            *[f"- {question}" for question in phone_questions(place)],
            "",
            "## 7. 대체 후보",
        ]
    )
    if alternatives:
        for alt in alternatives:
            short = []
            if yn(alt.row.get("일층")) == "Y":
                short.append("1층")
            if yn(alt.row.get("입구턱")) == "N" or yn(alt.row.get("입구문턱")) == "Y":
                short.append("입구턱 없음")
            if yn(alt.row.get("경사로")) == "Y":
                short.append("경사로 있음")
            if yn(alt.row.get("장애인주차장")) == "Y":
                short.append("장애인주차장 있음")
            if yn(alt.row.get("주차장")) == "Y":
                short.append("주차장 있음")
            lines.append(f"- {alt.display_name}: 약 {alt.distance_m:.0f}m, {', '.join(short) or '세부 확인 필요'}")
    else:
        lines.append("- [확인 필요] 같은 조건의 대체 후보가 없습니다. 반경을 넓혀 재검색하세요.")

    if nearby_chargers:
        lines.extend(["", "## 참고. 휠체어 충전소"])
        lines.extend(
            f"- {item.get('시설물명')} 약 {item['distance_m']:.0f}m - {item.get('소재지 주소')}"
            for item in nearby_chargers
        )

    lines.extend(
        [
            "",
            "## 데이터 한계",
            "- 장소 접근성은 서초구 무장애가게 CSV의 Y/N 값을 기준으로 합니다.",
            "- 주변 화장실은 서울시 공중화장실 위치정보와 서초구 장애인 편의시설 CSV를 보조로 사용합니다.",
            "- 실제 보행 경로의 경사, 턱, 공사, 엘리베이터 고장 여부는 이 MVP에서 확정하지 않습니다.",
        ]
    )
    return "\n".join(lines) + "\n"


def build_checklist(args: argparse.Namespace) -> str:
    client = KakaoLocalClient(load_env_key(Path(args.env)))
    location_query, category, preference = parse_query(args.query, args.location, args.category)
    origin = resolve_location(client, location_query)
    raw_places = load_places(Path(args.stores), category, origin, args.radius)
    intent_note = "카테고리와 접근성 점수를 기준으로 후보를 정렬했습니다."
    if preference:
        preferred = [place for place in raw_places if row_matches_preference(place.row, preference)]
        if preferred:
            exact_preferred = [
                place for place in preferred if row_matches_exact_preference(place.row, preference)
            ]
            raw_places = preferred
            if exact_preferred:
                intent_note = f"질문에 '{preference}' 의도가 있어 정확 일치 후보에 가중치를 두고 관련 후보를 정렬했습니다."
            else:
                intent_note = f"질문에 '{preference}' 의도가 있어 관련 후보만 우선 정렬했습니다."
        else:
            expanded_radius = max(args.radius * 2, 2500)
            expanded_places = load_places(Path(args.stores), category, origin, expanded_radius)
            preferred = [
                place for place in expanded_places if row_matches_preference(place.row, preference)
            ]
            if preferred:
                exact_preferred = [
                    place for place in preferred if row_matches_exact_preference(place.row, preference)
                ]
                raw_places = preferred
                intent_note = (
                    f"기본 반경 {args.radius}m 안에 '{preference}' 관련 후보가 없어 "
                    f"{expanded_radius}m까지 넓혀 찾았습니다."
                )
                if exact_preferred:
                    intent_note = (
                        f"기본 반경 {args.radius}m 안에 '{preference}' 정확 일치 후보가 없어 "
                        f"{expanded_radius}m까지 넓히고 정확 일치 후보에 가중치를 두었습니다."
                    )
            else:
                intent_note = (
                    f"'{preference}' 관련 후보를 찾지 못해 전체 {category} 후보를 정렬했습니다."
                )
    places = [score_place(place, preference) for place in raw_places]
    places.sort(key=lambda place: (-place.score, place.distance_m))
    if not places:
        raise SystemExit(
            f"후보 장소가 없습니다. category={category}, location={origin['name']}, radius={args.radius}m"
        )

    top_places = places[: max(args.top + 4, 6)]
    dongs = {place.dong for place in top_places if place.dong}
    facilities = geocode_facilities_for_dongs(
        client,
        Path(args.facilities),
        Path(args.geocode_cache),
        dongs,
        max_new_geocodes=args.max_new_geocodes,
    )
    toilets = load_toilets(Path(args.toilets))

    place = places[0]
    alternatives = places[1 : args.top]
    nearby_toilets = nearest_toilets(toilets, place.lat, place.lon, args.facility_radius, limit=3)
    station_toilets = nearest_toilets(toilets, origin["lat"], origin["lon"], args.facility_radius, limit=3)
    nearby_parking = nearest_facilities(
        facilities, place.lat, place.lon, args.facility_radius, "장애인 주차장", limit=3
    )
    nearby_elevators = nearest_facilities(
        facilities, origin["lat"], origin["lon"], args.facility_radius, "장애인용 승강기", limit=3
    )
    nearby_chargers = nearest_facilities(
        facilities, place.lat, place.lon, args.facility_radius, "휠체어 충전소", limit=3
    )

    return render_checklist(
        query=args.query,
        origin=origin,
        category=category,
        preference=preference,
        intent_note=intent_note,
        place=place,
        alternatives=alternatives,
        toilets=nearby_toilets,
        station_toilets=station_toilets,
        nearby_parking=nearby_parking,
        nearby_elevators=nearby_elevators,
        nearby_chargers=nearby_chargers,
        radius_m=args.facility_radius,
    )


def main() -> None:
    parser = argparse.ArgumentParser(
        description="서초구 휠체어 이용자 이동 전 체크리스트 MVP",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument("query", help="예: 양재역 근처에서 휠체어로 갈 만한 카페 추천해줘")
    parser.add_argument("--location", default="", help="질문에서 위치를 못 잡을 때 직접 지정")
    parser.add_argument("--category", default="", help="카페, 음식점, 전체 등 직접 지정")
    parser.add_argument("--radius", type=int, default=900, help="장소 후보 검색 반경(m)")
    parser.add_argument("--facility-radius", type=int, default=500, help="화장실/주차장/승강기 검색 반경(m)")
    parser.add_argument("--top", type=int, default=4, help="추천 1개 + 대체 후보 수 기준")
    parser.add_argument("--stores", default=str(DEFAULT_STORE_CSV), help="서초구 무장애가게 CSV")
    parser.add_argument("--toilets", default=str(DEFAULT_TOILET_CSV), help="서울시 공중화장실 위치정보 CSV")
    parser.add_argument("--facilities", default=str(DEFAULT_FACILITY_CSV), help="서초구 장애인 편의시설현황 CSV")
    parser.add_argument("--geocode-cache", default=str(DEFAULT_GEOCODE_CACHE), help="주소 geocoding 캐시")
    parser.add_argument("--max-new-geocodes", type=int, default=250, help="이번 실행에서 새로 좌표 변환할 최대 시설 수")
    parser.add_argument("--env", default=str(DEFAULT_ENV), help="KAKAO_REST_API_KEY가 있는 env 파일")
    parser.add_argument("--output", default="", help="Markdown 결과 저장 경로")
    args = parser.parse_args()

    for input_path in (args.stores, args.toilets, args.facilities):
        if not Path(input_path).exists():
            raise SystemExit(f"Required file not found: {input_path}")
    if not os.environ.get("KAKAO_REST_API_KEY") and not Path(args.env).exists():
        raise SystemExit(f"Required file not found: {args.env}")

    checklist = build_checklist(args)
    sys.stdout.write(checklist)
    if args.output:
        output_path = Path(args.output)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(checklist, encoding="utf-8")
        print(f"\nSaved: {output_path.resolve()}", file=sys.stderr)


if __name__ == "__main__":
    main()
