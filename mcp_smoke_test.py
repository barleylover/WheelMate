import argparse
import json
import os
import subprocess
import sys
from pathlib import Path


def read_key_from_env_file(path: Path) -> str:
    if not path.exists():
        return ""
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        if line.strip().startswith("KAKAO_REST_API_KEY="):
            return line.split("=", 1)[1].strip().strip("\"'")
    return ""


def frame(payload: dict) -> bytes:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    return f"Content-Length: {len(body)}\r\n\r\n".encode("ascii") + body


def read_frame(stream) -> dict:
    headers = {}
    while True:
        line = stream.readline()
        if not line:
            raise RuntimeError("server closed stdout")
        if line in (b"\r\n", b"\n"):
            break
        key, _, value = line.decode("ascii").partition(":")
        headers[key.lower()] = value.strip()
    body = stream.read(int(headers["content-length"]))
    return json.loads(body.decode("utf-8"))


def request(proc, payload: dict) -> dict:
    proc.stdin.write(frame(payload))
    proc.stdin.flush()
    return read_frame(proc.stdout)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--call", action="store_true", help="also call the checklist tool")
    parser.add_argument("--query", default="방배역 근처 음식점 추천 좀. 쌀국수가 땡겨")
    args = parser.parse_args()

    env = dict(os.environ)
    env.setdefault("PYTHONIOENCODING", "utf-8")
    env.setdefault("DATA_DIR", str(Path("data").resolve()))
    env.setdefault("MAX_NEW_GEOCODES", "0")
    env.setdefault("KAKAO_REST_API_KEY", read_key_from_env_file(Path("api_key.env")))

    proc = subprocess.Popen(
        [sys.executable, "mcp_server.py"],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        env=env,
    )
    try:
        print(json.dumps(request(proc, {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}}), ensure_ascii=False, indent=2))
        print(json.dumps(request(proc, {"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}}), ensure_ascii=False, indent=2))
        if args.call:
            reply = request(
                proc,
                {
                    "jsonrpc": "2.0",
                    "id": 3,
                    "method": "tools/call",
                    "params": {
                        "name": "seocho_previsit_checklist",
                        "arguments": {"query": args.query},
                    },
                },
            )
            print(json.dumps(reply, ensure_ascii=False, indent=2)[:5000])
    finally:
        proc.kill()
        proc.wait(timeout=5)


if __name__ == "__main__":
    main()
