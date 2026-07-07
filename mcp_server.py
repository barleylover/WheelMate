import argparse
import json
import os
import sys
import traceback
from pathlib import Path
from typing import Any

from previsit_checklist import build_checklist


APP_DIR = Path(__file__).resolve().parent
DATA_DIR = Path(os.environ.get("DATA_DIR", APP_DIR / "data"))


TOOLS = [
    {
        "name": "seocho_previsit_checklist",
        "description": (
            "서초구에서 장애인/휠체어 이용자가 방문 전 확인해야 할 장소 접근성, "
            "이동 동선, 장애인화장실, 주차, 영업/전화 확인, 대체 후보를 점검합니다."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "예: 방배역 근처 음식점 추천 좀. 쌀국수가 땡겨",
                },
                "location": {
                    "type": "string",
                    "description": "질문에서 위치를 못 잡을 때 직접 지정합니다.",
                    "default": "",
                },
                "category": {
                    "type": "string",
                    "description": "카페, 음식점, 전체 등 직접 지정합니다.",
                    "default": "",
                },
                "radius": {
                    "type": "integer",
                    "description": "장소 후보 검색 반경(m)",
                    "default": 900,
                    "minimum": 100,
                    "maximum": 5000,
                },
                "facility_radius": {
                    "type": "integer",
                    "description": "화장실/주차장/승강기 후보 검색 반경(m)",
                    "default": 500,
                    "minimum": 100,
                    "maximum": 3000,
                },
                "top": {
                    "type": "integer",
                    "description": "추천 1개와 대체 후보 목록 기준 개수",
                    "default": 4,
                    "minimum": 1,
                    "maximum": 10,
                },
            },
            "required": ["query"],
            "additionalProperties": False,
        },
    }
]


def read_message() -> dict[str, Any] | None:
    headers: dict[str, str] = {}
    while True:
        line = sys.stdin.buffer.readline()
        if not line:
            return None
        if line in (b"\r\n", b"\n"):
            break
        name, _, value = line.decode("ascii", "replace").partition(":")
        headers[name.strip().lower()] = value.strip()

    length = int(headers.get("content-length", "0"))
    if length <= 0:
        return None
    body = sys.stdin.buffer.read(length)
    return json.loads(body.decode("utf-8"))


def write_message(message: dict[str, Any]) -> None:
    body = json.dumps(message, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    sys.stdout.buffer.write(f"Content-Length: {len(body)}\r\n\r\n".encode("ascii"))
    sys.stdout.buffer.write(body)
    sys.stdout.buffer.flush()


def response(request_id: Any, result: Any) -> dict[str, Any]:
    return {"jsonrpc": "2.0", "id": request_id, "result": result}


def error_response(request_id: Any, code: int, message: str, data: Any = None) -> dict[str, Any]:
    error: dict[str, Any] = {"code": code, "message": message}
    if data is not None:
        error["data"] = data
    return {"jsonrpc": "2.0", "id": request_id, "error": error}


def checklist_args(arguments: dict[str, Any]) -> argparse.Namespace:
    return argparse.Namespace(
        query=arguments["query"],
        location=arguments.get("location", ""),
        category=arguments.get("category", ""),
        radius=int(arguments.get("radius", 900)),
        facility_radius=int(arguments.get("facility_radius", 500)),
        top=int(arguments.get("top", 4)),
        stores=str(Path(os.environ.get("ACCESSIBLE_STORE_CSV", DATA_DIR / "seocho_accessible_stores.csv"))),
        toilets=str(Path(os.environ.get("PUBLIC_TOILET_CSV", DATA_DIR / "seoul_public_toilets.csv"))),
        facilities=str(Path(os.environ.get("DISABLED_FACILITY_CSV", DATA_DIR / "seocho_disabled_facilities.csv"))),
        geocode_cache=str(
            Path(os.environ.get("GEOCODE_CACHE_CSV", DATA_DIR / "seocho_disabled_facilities_geocoded.csv"))
        ),
        max_new_geocodes=int(os.environ.get("MAX_NEW_GEOCODES", "0")),
        env=str(Path(os.environ.get("KAKAO_ENV_FILE", APP_DIR / "api_key.env"))),
        output="",
    )


def handle_tools_call(request_id: Any, params: dict[str, Any]) -> dict[str, Any]:
    name = params.get("name")
    arguments = params.get("arguments") or {}
    if name != "seocho_previsit_checklist":
        return error_response(request_id, -32602, f"Unknown tool: {name}")
    if not isinstance(arguments, dict) or not arguments.get("query"):
        return error_response(request_id, -32602, "query is required")

    try:
        markdown = build_checklist(checklist_args(arguments))
    except Exception as exc:
        return response(
            request_id,
            {
                "content": [
                    {
                        "type": "text",
                        "text": f"체크리스트 생성 실패: {exc}\n\n{traceback.format_exc()}",
                    }
                ],
                "isError": True,
            },
        )

    return response(
        request_id,
        {
            "content": [
                {
                    "type": "text",
                    "text": markdown,
                }
            ],
            "isError": False,
        },
    )


def handle_request(message: dict[str, Any]) -> dict[str, Any] | None:
    method = message.get("method")
    request_id = message.get("id")
    params = message.get("params") or {}

    if request_id is None:
        return None

    if method == "initialize":
        return response(
            request_id,
            {
                "protocolVersion": "2024-11-05",
                "capabilities": {"tools": {}},
                "serverInfo": {"name": "seocho-accessibility-mcp", "version": "0.1.0"},
            },
        )
    if method == "tools/list":
        return response(request_id, {"tools": TOOLS})
    if method == "tools/call":
        return handle_tools_call(request_id, params)
    if method == "ping":
        return response(request_id, {})
    return error_response(request_id, -32601, f"Method not found: {method}")


def main() -> None:
    while True:
        message = read_message()
        if message is None:
            break
        reply = handle_request(message)
        if reply is not None:
            write_message(reply)


if __name__ == "__main__":
    main()
