#!/usr/bin/env python3
"""Zero-dependency static server for 奶蛙乐园.

Run:  python serve.py [port]
Then open http://127.0.0.1:<port>/ (default 8000).
ES modules and audio fetch require http://, not file://.
"""
import http.server
import os
import socketserver
import sys
import webbrowser

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
ROOT = os.path.dirname(os.path.abspath(__file__))


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):
        sys.stderr.write("[serve] " + (fmt % args) + "\n")


class ThreadedServer(socketserver.ThreadingTCPServer):
    daemon_threads = True
    allow_reuse_address = False


def main():
    try:
        httpd = ThreadedServer(("127.0.0.1", PORT), Handler)
    except OSError as exc:
        print(f"[serve] 端口 {PORT} 已被占用，或无法绑定：{exc}")
        print(f"[serve] 换个端口再试：python serve.py {PORT + 1}")
        raise SystemExit(1)
    with httpd:
        url = f"http://127.0.0.1:{PORT}/"
        print(f"奶蛙乐园 running at {url}")
        print("Press Ctrl+C to stop.")
        if not os.environ.get("NO_BROWSER"):
            try:
                webbrowser.open(url)
            except Exception:
                pass
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nbye")


if __name__ == "__main__":
    main()
