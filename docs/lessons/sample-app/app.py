import json
import os
from http.server import BaseHTTPRequestHandler, HTTPServer


message = os.getenv("APP_MESSAGE", "hello from cloud katas")
version = os.getenv("APP_VERSION", "v1")
crash_on_start = os.getenv("CRASH_ON_START", "false").lower() == "true"
memory_hog_mb = int(os.getenv("MEMORY_HOG_MB", "0"))

if crash_on_start:
    raise RuntimeError("CRASH_ON_START=true was set")

memory_hog = bytearray(memory_hog_mb * 1024 * 1024)


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/healthz":
            self.respond(200, {"status": "ok", "version": version})
            return

        if self.path == "/readyz":
            self.respond(200, {"status": "ready"})
            return

        self.respond(
            200,
            {
                "message": message,
                "version": version,
                "path": self.path,
                "memory_hog_mb": len(memory_hog) // 1024 // 1024,
            },
        )

    def log_message(self, format, *args):
        print(
            json.dumps(
                {
                    "client": self.client_address[0],
                    "method": self.command,
                    "path": self.path,
                    "status": getattr(self, "last_status", "-"),
                }
            ),
            flush=True,
        )

    def respond(self, status, payload):
        self.last_status = status
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8080"))
    server = HTTPServer(("0.0.0.0", port), Handler)
    print(json.dumps({"event": "server_started", "port": port, "version": version}), flush=True)
    server.serve_forever()
