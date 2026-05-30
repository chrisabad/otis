#!/usr/bin/env python3
"""
weekend_cap_alerter.py — Watches Weekend-keyed LLM spend against $150/mo cap.

Run on Otis cron (suggested every 30 min). Computes month-to-date spend on the
21 weekend-cap-eligible LiteLLM model aliases (Anthropic + Gemini Weekend +
specialty), compares to $150, and asks Attention Broker whether to surface.
If broker says surface, posts to #agent-ops via Slack tool.

Note: today, per-agent keys are NOT yet assigned to the weekend-cap team
(blocked on AGE-13366 master-key rotation). So this alerter aggregates spend by
*model alias* — every call to one of the cap-eligible aliases counts, regardless
of which key authenticated the call. Once AGE-13366 lands and per-agent keys
join the team, the team budget enforces hard-fail at 100% automatically and
this alerter only handles the soft 80% notification.

Usage:
  weekend_cap_alerter.py                  # check + maybe surface (production cron)
  weekend_cap_alerter.py --dry-run        # compute and print, do not call broker or post
  weekend_cap_alerter.py --threshold 0.8  # change soft threshold (default 0.80)

Env required:
  DATABASE_URL          # litellm postgres URL (read from ~/.litellm/.env if absent)

Optional:
  SLACK_WEBHOOK_URL     # if not set, alerter prints to stdout but doesn't post
  WEEKEND_CAP_USD       # cap override (default 150)
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request
from datetime import date, timedelta

LITELLM_ENV = os.path.expanduser("~/.litellm/.env")
NOTIF_BASE = "http://127.0.0.1:8012"

# Aliases assigned to the LiteLLM weekend-cap team (must match `weekend-cap`
# team's `models` array in LiteLLM_TeamTable). Keep in sync.
WEEKEND_CAP_ALIASES = [
    # Anthropic-backed
    "pro-claude", "writing", "writing-claude-opus", "writing-claude-sonnet",
    "frontier-writing", "frontier-writing-sonnet", "frontier-code-claude",
    "frontier-reasoning", "pro-weekend", "fast-weekend", "code-gpt",
    "routine-code-claude",
    # Gemini-backed
    "pro-gemini", "frontier-code-gemini", "frontier-reasoning-gemini",
    "heartbeat-gemini", "pro-weekend-gemini", "fast-weekend-gemini",
    "image-gen", "video-gen", "embed-gemini",
]


def load_env_file(path: str) -> dict:
    out: dict[str, str] = {}
    try:
        with open(path) as fh:
            for line in fh:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, _, v = line.partition("=")
                out[k.strip()] = v.strip().strip('"').strip("'")
    except FileNotFoundError:
        pass
    return out


def get_database_url() -> str:
    if os.environ.get("DATABASE_URL_LITELLM"):
        return os.environ["DATABASE_URL_LITELLM"]
    return load_env_file(LITELLM_ENV).get("DATABASE_URL", "").replace("host.docker.internal", "127.0.0.1")


def psql_scalar(database_url: str, sql: str) -> str:
    proc = subprocess.run(
        ["psql", database_url, "-t", "-A", "-c", sql],
        capture_output=True, text=True, check=True,
    )
    return proc.stdout.strip()


def mtd_spend_on_cap_aliases(database_url: str, month_start: date, today: date) -> tuple[float, int]:
    """Return (spend_usd, requests) for the cap-eligible aliases since month_start."""
    # Spend table records the underlying-provider model (e.g. openai/weekend-sonnet,
    # gemini/gemini-2.5-pro) — not the LiteLLM alias. Map alias → underlying via
    # config keywords. For the weekend cap we care about Anthropic+Gemini lines.
    sql = f"""
        SELECT
          COALESCE(ROUND(SUM(spend)::numeric, 4), 0)::text || '|' ||
          COALESCE(SUM(api_requests)::text, '0')
        FROM "LiteLLM_DailyUserSpend"
        WHERE date >= '{month_start.isoformat()}' AND date <= '{today.isoformat()}'
          AND (
            model LIKE 'openai/weekend-%'      -- Anthropic via Weekend OAuth proxy
            OR model LIKE 'gemini/%'           -- Gemini (any model)
            OR model LIKE 'xai/%'              -- xAI grok (in-cap if Weekend-billed)
          )
    """
    raw = psql_scalar(database_url, sql) or "0|0"
    spend_str, reqs_str = (raw + "|0").split("|")[:2]
    return float(spend_str or 0), int(reqs_str or 0)


def _board_key() -> str:
    val = os.environ.get("PAPERCLIP_BOARD_KEY", "")
    if val:
        return val
    try:
        proc = subprocess.run(["launchctl", "getenv", "PAPERCLIP_BOARD_KEY"],
                              capture_output=True, text=True, timeout=2)
        return proc.stdout.strip()
    except Exception:
        return ""


def _notif_request(method: str, path: str, data: dict | None = None) -> dict:
    headers = {"Content-Type": "application/json"}
    bk = _board_key()
    if bk:
        headers["Authorization"] = f"Bearer {bk}"
    body = json.dumps(data).encode() if data is not None else None
    req = urllib.request.Request(
        f"{NOTIF_BASE}{path}",
        data=body,
        headers=headers,
        method=method,
    )
    try:
        return json.loads(urllib.request.urlopen(req, timeout=5).read())
    except urllib.error.HTTPError as e:
        return {"error": f"http {e.code}: {e.read()[:200].decode()}"}
    except urllib.error.URLError as e:
        return {"error": f"unreachable: {e}"}


def notification_surface(spend: float, cap: float, ratio: float) -> dict:
    """POST to notification service; returns {"surfaced": bool, "id": str, "duplicate": bool}."""
    band = "critical" if ratio >= 1.0 else "warning"
    priority = "immediate" if ratio >= 1.0 else "daily_brief"
    month_start = date.today().replace(day=1).isoformat()
    fingerprint = f"weekend-cap-alerter-{band}-{month_start}"
    result = _notif_request("POST", "/notifications", {
        "source": "otis",
        "topic_class": "ops",
        "priority": priority,
        "fingerprint": fingerprint,
        "payload": {
            "spend_usd": round(spend, 2),
            "cap_usd": cap,
            "ratio": round(ratio, 3),
            "alerter": "weekend_cap_alerter.py",
            "business": "age",
        },
    })
    return result


def notification_mark_acted(notification_id: str) -> None:
    _notif_request("PATCH", f"/notifications/{notification_id}", {"state": "acted"})


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.strip().splitlines()[0])
    ap.add_argument("--threshold", type=float, default=0.80, help="Soft threshold ratio (default 0.80)")
    ap.add_argument("--cap", type=float, default=float(os.environ.get("WEEKEND_CAP_USD", "150")), help="Cap in USD (default 150)")
    ap.add_argument("--dry-run", action="store_true", help="Compute and print; do not contact broker or Slack")
    args = ap.parse_args()

    db_url = get_database_url()
    if not db_url:
        print("ERROR: DATABASE_URL not found", file=sys.stderr)
        return 2

    today = date.today()
    month_start = today.replace(day=1)
    spend, reqs = mtd_spend_on_cap_aliases(db_url, month_start, today)
    ratio = spend / args.cap if args.cap else 0.0

    print(f"weekend-cap MTD: ${spend:.2f} / ${args.cap:.2f} = {ratio*100:.1f}% (since {month_start}, {reqs:,} reqs)")

    if ratio < args.threshold:
        print(f"under threshold ({args.threshold*100:.0f}%) — no action")
        return 0

    if args.dry_run:
        priority = "immediate" if ratio >= 1.0 else "daily_brief"
        print(f"DRY RUN: would post notification with ratio={ratio:.3f}, priority={priority}")
        return 0

    result = notification_surface(spend, args.cap, ratio)
    if result.get("error"):
        print(f"notification service error — fail open: {result['error']}")
    elif result.get("duplicate"):
        print(f"notification dedup — already surfaced this month-band (id: {result.get('id','?')[:8]})")
    else:
        notif_id = result.get("id", "")
        msg = (
            f":warning: Weekend LLM cap at {ratio*100:.0f}%\n"
            f"MTD spend: ${spend:.2f} / ${args.cap:.2f} (since {month_start.isoformat()})\n"
            f"Aliases tracked: {len(WEEKEND_CAP_ALIASES)} weekend-cap routes\n"
            f"Hard fail at 100% — investigate top spending aliases via "
            f"`python3 ~/.hermes/workspace/agents/otis/tools/monthly_cost_report.py --period 7`"
        )
        print(f"\n--- would post to #agent-ops ---\n{msg}")
        # TODO: integrate with Slack tool. Today, prints; once wired up, post via
        # the message tool with channel=agent-ops.
        if notif_id:
            notification_mark_acted(notif_id)

    return 0


if __name__ == "__main__":
    sys.exit(main())
