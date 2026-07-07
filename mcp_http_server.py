import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

from mcp_server import TOOLS, error_response, handle_tools_call, response


def json_bytes(payload: dict[str, Any]) -> bytes:
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


def handle_jsonrpc(payload: dict[str, Any]) -> dict[str, Any] | None:
    method = payload.get("method")
    request_id = payload.get("id")
    params = payload.get("params") or {}

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


class MCPHandler(BaseHTTPRequestHandler):
    server_version = "SeochoAccessibilityMCP/0.1"

    def send_json(self, status: int, payload: dict[str, Any]) -> None:
        body = json_bytes(payload)
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "content-type, authorization")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "content-type, authorization")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.end_headers()

    def do_GET(self) -> None:
        if self.path in {"/", "/health", "/healthz"}:
            self.send_json(
                200,
                {
                    "status": "ok",
                    "name": "seocho-accessibility-mcp",
                    "mcp_endpoint": "/mcp",
                    "tools": [tool["name"] for tool in TOOLS],
                },
            )
            return
        if self.path == "/mcp":
            self.send_json(
                200,
                {
                    "status": "ok",
                    "message": "Send JSON-RPC MCP requests to this endpoint with POST.",
                    "tools": [tool["name"] for tool in TOOLS],
                },
            )
            return
        self.send_json(404, {"error": "not_found"})

    def do_POST(self) -> None:
        if self.path not in {"/mcp", "/"}:
            self.send_json(404, {"error": "not_found"})
            return
        try:
            length = int(self.headers.get("content-length", "0"))
            raw = self.rfile.read(length)
            payload = json.loads(raw.decode("utf-8"))
        except Exception as exc:
            self.send_json(400, {"jsonrpc": "2.0", "id": None, "error": {"code": -32700, "message": str(exc)}})
            return

        if isinstance(payload, list):
            replies = [reply for item in payload if (reply := handle_jsonrpc(item)) is not None]
            self.send_json(200, replies)
            return

        reply = handle_jsonrpc(payload)
        if reply is None:
            self.send_response(202)
            self.end_headers()
            return
        self.send_json(200, reply)

    def log_message(self, fmt: str, *args: Any) -> None:
        print(f"{self.address_string()} - {fmt % args}", flush=True)


def main() -> None:
    port = int(os.environ.get("PORT", "8080"))
    host = os.environ.get("HOST", "0.0.0.0")
    httpd = ThreadingHTTPServer((host, port), MCPHandler)
    print(f"seocho-accessibility-mcp HTTP server listening on {host}:{port}", flush=True)
    httpd.serve_forever()


if __name__ == "__main__":
    main()
