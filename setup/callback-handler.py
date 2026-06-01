#!/usr/bin/env python3
"""
GitHub App manifest callback handler.
Listens for the redirect after GitHub creates the app, exchanges the code
for permanent credentials, and saves them to ~/.hermes/workspace/github-apps/<slug>/.

Usage:
  python3 callback-handler.py [--once]

  --once: exit after first successful capture
"""

import http.server
import urllib.parse
import urllib.request
import json
import os
import sys
import stat
from pathlib import Path

PORT = 8765
HOST = "0.0.0.0"


def exchange_code(code: str) -> dict:
    url = f"https://api.github.com/app-manifests/{code}/conversions"
    req = urllib.request.Request(
        url,
        method="POST",
        headers={
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        },
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())


def save_credentials(slug: str, data: dict):
    out_dir = Path.home() / ".hermes" / "workspace" / "github-apps" / slug
    out_dir.mkdir(parents=True, exist_ok=True)

    def write_secret(path, content):
        path.write_text(content)
        path.chmod(stat.S_IRUSR | stat.S_IWUSR)

    (out_dir / "app-id.txt").write_text(str(data["id"]))
    (out_dir / "github-slug.txt").write_text(data["slug"])
    write_secret(out_dir / "private-key.pem", data["pem"])
    if data.get("webhook_secret"):
        write_secret(out_dir / "webhook-secret.txt", data["webhook_secret"])
    write_secret(out_dir / "registration.json", json.dumps(data, indent=2))

    print(f"\n✓ Saved to {out_dir}")
    print(f"  App ID:  {data['id']}")
    print(f"  Slug:    {data['slug']}")
    print(f"  Name:    {data['name']}")


once = "--once" in sys.argv
server = None


class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass  # quiet

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        params = urllib.parse.parse_qs(parsed.query)

        code = params.get("code", [None])[0]
        slug = params.get("slug", params.get("state", ["unknown"]))[0]

        if not code:
            self._respond(400, "Missing code parameter")
            return

        print(f"\n→ Got callback for slug={slug}, exchanging code...")
        try:
            data = exchange_code(code)
            save_credentials(slug, data)
            self._respond(200, f"<h2>✓ App '{data['name']}' registered!</h2>"
                              f"<p>App ID: {data['id']}<br>Slug: {data['slug']}</p>"
                              f"<p>Credentials saved to ~/.hermes/workspace/github-apps/{slug}/</p>")
        except Exception as e:
            print(f"✗ Error: {e}")
            self._respond(500, f"<h2>Error</h2><pre>{e}</pre>")
            return

        if once and server:
            import threading
            threading.Thread(target=server.shutdown, daemon=True).start()

    def _respond(self, code, body):
        self.send_response(code)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.end_headers()
        self.wfile.write(f"<!DOCTYPE html><html><body>{body}</body></html>".encode())


print(f"Listening on {HOST}:{PORT} — waiting for GitHub callback...")
server = http.server.HTTPServer((HOST, PORT), Handler)
server.serve_forever()
