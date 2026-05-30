#!/usr/bin/env python3
"""
monthly_cost_report.py — Monthly LLM cost report by business.

Reads LiteLLM_DailyUserSpend (joined with VerificationToken for key aliases),
maps each key alias to a Paperclip company via the agents API, and produces a
markdown report grouped by company / provider / model with prior-month deltas.

Used for AGE-13368 (Phase 4 of LLM cost discipline). Run via Otis cron on the
9th of each month at 9am PT.

Usage:
  monthly_cost_report.py                # report for prior 30 days vs prior 60-30 days, print to stdout
  monthly_cost_report.py --period 30    # custom day range
  monthly_cost_report.py --post         # also post the report as a comment on AGE-13368

Env required:
  DATABASE_URL_LITELLM     # litellm postgres URL (read from ~/.litellm/.env if absent)
  PAPERCLIP_API_KEY_AGE    # Paperclip key (read from agent .env if absent)
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request
from collections import defaultdict
from datetime import date, timedelta

LITELLM_ENV = os.path.expanduser("~/.litellm/.env")
OTIS_ENV = os.path.expanduser("~/.hermes/workspace/agents/otis/.env")
PAPERCLIP_BASE = "http://127.0.0.1:3101/api"

COMPANIES = {
    "AGE": "0f6e2b9b-12b2-4306-9798-16325c788e6f",
    "KAL": "c8923cf7-1128-435f-8a6b-7f1b4d4fcd06",
    "WEE": "dfd450ac-34c2-40a4-b3bc-4e4df9b59cea",
    "FON": "05fe3b35-2628-466f-be35-1bc985d88fa2",
    "DIA": "35536b37-3d4c-4375-a180-3ce2676f62fc",
    "PIX": "1a8640cc-7ccf-4387-9228-a85ad168c7f3",
    "STU": "c21b92aa-a2d7-46d3-8dda-243bd7c89a3a",
}

# Provider classification for backend-level grouping. Matches LiteLLM model
# strings as they appear in LiteLLM_DailyUserSpend.model.
def classify_provider(model: str) -> str:
    if not model:
        return "unknown"
    m = model.lower()
    if "weekend-" in m or "kaleidoscope-" in m or "personal-" in m:
        return "anthropic"
    if m.startswith("gemini/") or "gemini-" in m or "veo" in m or "imagen" in m or "embed" in m:
        return "gemini"
    if m.startswith("xai/") or "grok" in m:
        return "xai"
    if "/glm-" in m or "qwen" in m or "gemma" in m or "ministral" in m or "minimax" in m:
        return "ollama"
    return "other"


def load_env_file(path: str) -> dict:
    out = {}
    try:
        with open(path) as fh:
            for line in fh:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, _, v = line.partition("=")
                v = v.strip().strip('"').strip("'")
                out[k.strip()] = v
    except FileNotFoundError:
        pass
    return out


def get_database_url() -> str:
    if os.environ.get("DATABASE_URL_LITELLM"):
        return os.environ["DATABASE_URL_LITELLM"]
    env = load_env_file(LITELLM_ENV)
    url = env.get("DATABASE_URL", "")
    return url.replace("host.docker.internal", "127.0.0.1")


def get_paperclip_key() -> str:
    if os.environ.get("PAPERCLIP_API_KEY_AGE"):
        return os.environ["PAPERCLIP_API_KEY_AGE"]
    return load_env_file(OTIS_ENV).get("PAPERCLIP_API_KEY_AGE", "")


def psql_json(database_url: str, sql: str) -> list[dict]:
    """Run SQL via psql and return rows as list of dicts (using JSON aggregation)."""
    wrapped = f"SELECT COALESCE(json_agg(t), '[]'::json) FROM ({sql}) t"
    proc = subprocess.run(
        ["psql", database_url, "-t", "-A", "-c", wrapped],
        capture_output=True, text=True, check=True,
    )
    return json.loads(proc.stdout.strip() or "[]")


def fetch_spend(database_url: str, start: date, end: date) -> list[dict]:
    sql = f"""
        SELECT
          COALESCE(k.key_alias, '<unattributed>') AS key_alias,
          s.model,
          ROUND(SUM(s.spend)::numeric, 4) AS spend,
          SUM(s.api_requests) AS requests,
          SUM(s.successful_requests) AS successful_requests,
          SUM(s.failed_requests) AS failed_requests
        FROM "LiteLLM_DailyUserSpend" s
        LEFT JOIN "LiteLLM_VerificationToken" k ON s.api_key = k.token
        WHERE s.date >= '{start.isoformat()}' AND s.date < '{end.isoformat()}'
        GROUP BY k.key_alias, s.model
    """
    return psql_json(database_url, sql)


def fetch_agent_company_map(api_key: str) -> dict[str, str]:
    """Map agent name (lowercase) → company shortname based on agents.companyId.

    Note: Otis's API key only has AGE scope today; other companies will return
    empty / 403. The map is best-effort. Unmapped agents fall back to '<unknown>'.
    """
    out: dict[str, str] = {}
    for short, cid in COMPANIES.items():
        url = f"{PAPERCLIP_BASE}/companies/{cid}/agents"
        req = urllib.request.Request(url, headers={"Authorization": f"Bearer {api_key}"})
        try:
            agents = json.loads(urllib.request.urlopen(req, timeout=5).read())
        except (urllib.error.HTTPError, urllib.error.URLError):
            continue
        for a in agents:
            name = (a.get("name") or "").lower()
            if name:
                out[name] = short
    return out


def attribute_company(key_alias: str, agent_company: dict[str, str]) -> str:
    if not key_alias or key_alias == "<unattributed>":
        return "<unattributed>"
    return agent_company.get(key_alias.lower(), "<unknown>")


def aggregate(rows: list[dict], agent_company: dict[str, str]) -> dict:
    """Aggregate rows into nested company → provider → model totals."""
    totals = {
        "total_spend": 0.0,
        "by_company": defaultdict(lambda: {"spend": 0.0, "requests": 0, "by_provider": defaultdict(float), "by_agent": defaultdict(float)}),
        "by_provider": defaultdict(float),
        "by_model": defaultdict(lambda: {"spend": 0.0, "requests": 0}),
        "by_agent": defaultdict(lambda: {"spend": 0.0, "requests": 0}),
    }
    for r in rows:
        spend = float(r.get("spend") or 0.0)
        reqs = int(r.get("requests") or 0)
        company = attribute_company(r.get("key_alias", ""), agent_company)
        provider = classify_provider(r.get("model", ""))
        totals["total_spend"] += spend
        totals["by_company"][company]["spend"] += spend
        totals["by_company"][company]["requests"] += reqs
        totals["by_company"][company]["by_provider"][provider] += spend
        totals["by_company"][company]["by_agent"][r.get("key_alias", "?")] += spend
        totals["by_provider"][provider] += spend
        totals["by_model"][r.get("model", "?")]["spend"] += spend
        totals["by_model"][r.get("model", "?")]["requests"] += reqs
        totals["by_agent"][r.get("key_alias", "?")]["spend"] += spend
        totals["by_agent"][r.get("key_alias", "?")]["requests"] += reqs
    return totals


def fmt_money(x: float) -> str:
    return f"${x:,.2f}"


def fmt_delta(curr: float, prev: float) -> str:
    if prev <= 0:
        return f"{fmt_money(curr)} (new)" if curr > 0 else fmt_money(curr)
    delta = curr - prev
    pct = 100.0 * delta / prev
    sign = "+" if delta >= 0 else ""
    return f"{fmt_money(curr)} ({sign}{fmt_money(delta)}, {sign}{pct:.0f}%)"


def render_report(period_start: date, period_end: date, curr: dict, prev: dict, weekend_cap: float = 150.0) -> str:
    days = (period_end - period_start).days
    out = []
    out.append(f"# Monthly LLM cost report — {period_start.isoformat()} → {period_end.isoformat()} ({days}d)")
    out.append("")
    out.append(f"**Total spend (period):** {fmt_delta(curr['total_spend'], prev['total_spend'])}")
    out.append("")

    # Weekend cap status
    weekend_curr = sum(s for p, s in curr["by_provider"].items() if p in ("anthropic", "gemini", "xai"))
    pct = 100.0 * weekend_curr / weekend_cap if weekend_cap else 0
    out.append(f"## Weekend cap (Anthropic + Gemini + xAI)")
    out.append(f"- Used: {fmt_money(weekend_curr)} / {fmt_money(weekend_cap)} = **{pct:.0f}%**")
    out.append("")

    # By provider
    out.append("## By provider")
    out.append("| Provider | Spend | Δ vs prior |")
    out.append("|---|---:|---|")
    for p in ("anthropic", "gemini", "xai", "ollama", "other", "unknown"):
        c = curr["by_provider"].get(p, 0.0)
        pv = prev["by_provider"].get(p, 0.0)
        if c < 0.005 and pv < 0.005:
            continue
        out.append(f"| {p} | {fmt_money(c)} | {fmt_delta(c, pv)} |")
    out.append("")

    # By company
    out.append("## By company (per-business attribution)")
    out.append("| Company | Spend | Requests | Δ vs prior |")
    out.append("|---|---:|---:|---|")
    company_order = sorted(curr["by_company"].keys(), key=lambda k: -curr["by_company"][k]["spend"])
    for c in company_order:
        cs = curr["by_company"][c]["spend"]
        rs = curr["by_company"][c]["requests"]
        ps = prev["by_company"].get(c, {}).get("spend", 0.0)
        if cs < 0.01 and ps < 0.01:
            continue
        out.append(f"| {c} | {fmt_money(cs)} | {rs:,} | {fmt_delta(cs, ps)} |")
    out.append("")

    # Top 10 agents
    out.append("## Top 10 agents by spend")
    out.append("| Agent | Spend | Requests |")
    out.append("|---|---:|---:|")
    top = sorted(curr["by_agent"].items(), key=lambda kv: -kv[1]["spend"])[:10]
    for name, d in top:
        if d["spend"] < 0.01:
            continue
        out.append(f"| {name} | {fmt_money(d['spend'])} | {d['requests']:,} |")
    out.append("")

    # Top models
    out.append("## Top 10 models by spend")
    out.append("| Model | Spend | Requests |")
    out.append("|---|---:|---:|")
    top_m = sorted(curr["by_model"].items(), key=lambda kv: -kv[1]["spend"])[:10]
    for name, d in top_m:
        if d["spend"] < 0.01:
            continue
        out.append(f"| {name} | {fmt_money(d['spend'])} | {d['requests']:,} |")
    out.append("")

    out.append(f"_Generated by Otis monthly_cost_report.py — {date.today().isoformat()}_")
    return "\n".join(out)


def post_to_paperclip(api_key: str, identifier: str, body: str) -> str:
    url = f"{PAPERCLIP_BASE}/issues/{identifier}/comments"
    data = json.dumps({"body": body}).encode()
    req = urllib.request.Request(url, data=data, headers={
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
    }, method="POST")
    return json.loads(urllib.request.urlopen(req).read()).get("id", "?")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.strip().splitlines()[0])
    ap.add_argument("--period", type=int, default=30, help="Days in current period (default 30)")
    ap.add_argument("--end-date", type=str, default=None, help="Period end date YYYY-MM-DD (default = today)")
    ap.add_argument("--post", action="store_true", help="Post the report as a comment on AGE-13368")
    ap.add_argument("--issue", type=str, default="AGE-13368", help="Issue identifier to post the report on")
    ap.add_argument("--dry-run", action="store_true", help="Print the report; do not call Paperclip")
    args = ap.parse_args()

    db_url = get_database_url()
    if not db_url:
        print("ERROR: DATABASE_URL not found in env or ~/.litellm/.env", file=sys.stderr)
        return 2

    end = date.fromisoformat(args.end_date) if args.end_date else date.today()
    period = timedelta(days=args.period)
    curr_start, curr_end = end - period, end
    prev_start, prev_end = curr_start - period, curr_start

    api_key = get_paperclip_key()
    agent_company = fetch_agent_company_map(api_key) if api_key else {}

    curr_rows = fetch_spend(db_url, curr_start, curr_end)
    prev_rows = fetch_spend(db_url, prev_start, prev_end)
    curr = aggregate(curr_rows, agent_company)
    prev = aggregate(prev_rows, agent_company)

    report = render_report(curr_start, curr_end, curr, prev)
    print(report)

    if args.post and not args.dry_run:
        if not api_key:
            print("ERROR: --post requires PAPERCLIP_API_KEY_AGE", file=sys.stderr)
            return 2
        comment_id = post_to_paperclip(api_key, args.issue, report)
        print(f"\nPosted comment {comment_id[:8]}... on {args.issue}", file=sys.stderr)

    return 0


if __name__ == "__main__":
    sys.exit(main())
