#!/usr/bin/env python3
"""
Generate a GitHub App installation token from env vars.
Prints the token to stdout so callers can capture it:
  export GH_TOKEN=$(python3 setup/gen-github-token.py)

Required env vars:
  GITHUB_APP_ID
  GITHUB_INSTALLATION_ID
  GITHUB_APP_PRIVATE_KEY_B64  (base64-encoded PEM private key)
"""

import base64
import json
import os
import subprocess
import tempfile
import time
import urllib.request


def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def make_jwt(app_id: str, private_key_pem: bytes) -> str:
    now = int(time.time())
    header = b64url(json.dumps({"alg": "RS256", "typ": "JWT"}).encode())
    payload = b64url(json.dumps({"iat": now - 60, "exp": now + 600, "iss": app_id}).encode())
    signing_input = f"{header}.{payload}".encode()

    with tempfile.NamedTemporaryFile(delete=False, suffix=".pem") as f:
        f.write(private_key_pem)
        key_path = f.name

    try:
        sig = subprocess.check_output(
            ["openssl", "dgst", "-sha256", "-sign", key_path],
            input=signing_input,
            stderr=subprocess.DEVNULL,
        )
    finally:
        os.unlink(key_path)

    return f"{header}.{payload}.{b64url(sig)}"


def get_installation_token(app_id: str, installation_id: str, private_key_pem: bytes) -> str:
    jwt = make_jwt(app_id, private_key_pem)
    req = urllib.request.Request(
        f"https://api.github.com/app/installations/{installation_id}/access_tokens",
        method="POST",
        headers={
            "Authorization": f"Bearer {jwt}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        },
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())["token"]


app_id = os.environ["GITHUB_APP_ID"]
installation_id = os.environ["GITHUB_INSTALLATION_ID"]
private_key_pem = base64.b64decode(os.environ["GITHUB_APP_PRIVATE_KEY_B64"])

print(get_installation_token(app_id, installation_id, private_key_pem))
