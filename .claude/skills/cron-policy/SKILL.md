---
name: cron-policy
description: "Hard rules for any agent creating, modifying, or auditing a cron job. Mandates a valid delivery configuration on every job — either delivery.mode=none (agent sends its own output via message()) or delivery.mode=announce with explicit slack target (reminder pings to Chris). Use whenever a cron expression is being authored or reviewed."
version: 1.0.0
audience: shared
---
# SKILL: cron-policy
**Trigger:** Any agent creating, modifying, or auditing a cron job.

## The Rule (Non-negotiable)

Every cron job must have a valid delivery configuration before it is created or modified.
There are exactly two valid patterns:

### Pattern A — Agent cron (the agent sends its own output via `message()`)
```
"delivery": { "mode": "none" }
```
Use this for: daily briefs, monitors, sweeps, audits, verify jobs, health checks,
post-restart recovery, sub-agent orchestration, and any cron where the agent
calls `message(action=send, ...)` itself to deliver its output.

### Pattern B — Reminder cron (fire-and-forget ping to Chris)
```
"delivery": {
  "mode": "announce",
  "channel": "slack",
  "accountId": "kaleidoscope",
  "target": "D0AFURXGVTM"
}
```
Use this for: `reminder-*` named crons that deliver a brief ping to Chris's DM.
Never use `announce` without an explicit `target`.

## What's NEVER allowed

| ❌ Bad config | Why it's broken |
|---|---|
| `mode: announce, channel: slack` (no target) | Dumps raw agent reasoning to default announce channel (#agent-ops) |
| `mode: announce` (no channel, no target) | Same — routes to default, leaks internal work |
| `mode: announce, channel: kaleidoscope` (no target) | Routes to default Kaleidoscope channel, unpredictable |

## When creating a cron via `hermes cron add`

Always include `--delivery.mode none` for agent crons:
```bash
hermes cron add \
  --name "my-monitor" \
  --cron "0 8 * * *" \
  --session isolated \
  --delivery.mode none \
  --message "..."
```

For reminder crons:
```bash
hermes cron add \
  --name "reminder-my-task" \
  --at "2026-04-15T09:00:00-07:00" \
  --session isolated \
  --delivery.mode announce \
  --delivery.channel slack \
  --delivery.accountId kaleidoscope \
  --delivery.target D0AFURXGVTM \
  --message "Reminder: ..."
```

## Self-healing guardian

A nightly cron (`cron-delivery-guardian`) runs `tools/cron-delivery-guardian.py` and
auto-patches any misconfigured cron. Changes are logged to `memory/learnings.md`.
This is belt-and-suspenders — it doesn't replace following this policy.

## Service-Monitoring Crons (Non-negotiable)

Any cron that monitors or queries an external service (PaperClip, gateway, APIs) **must** test connectivity before doing any work.

### Required pattern
```python
# ── Connectivity check — must come FIRST ────────────────────────────────────
try:
    req = urllib.request.Request(f"{BASE_URL}/health-or-known-endpoint",
                                 headers={"Authorization": f"Bearer {API_KEY}"})
    with urllib.request.urlopen(req, timeout=5) as r:
        if r.status not in (200, 201):
            raise urllib.error.URLError(f"unexpected status {r.status}")
except Exception as e:
    msg = f"[CONNECTIVITY_FAILURE] {SERVICE} unreachable: {e}"
    print(msg, file=sys.stderr)
    log_to_cron_inbox(msg)
    sys.exit(1)   # ← non-zero so Hermes marks run as 'error', not 'ok'
```

### Why
When a service is down, cron jobs that swallow connectivity errors exit with status 0 ("ok"). Hermes marks the run healthy, Juno's health surface stays green, and nobody finds out the monitor has been broken for days. Exiting non-zero ensures the run appears as `error` and surfaces in Juno's heartbeat sweep.

### For shell-based crons
```bash
curl -sf --max-time 5 http://127.0.0.1:3101/api/agents/me \
     -H "Authorization: Bearer $API_KEY" > /dev/null || {
  echo "[CONNECTIVITY_FAILURE] PaperClip unreachable" | tee -a "$CRON_INBOX"
  exit 1
}
```

### For cron prompts (LLM-agent crons)
Include explicit failure handling in the prompt:
```
If the command exits non-zero: do NOT suppress the error.
Reply with: ERROR: <cron-name> failed — see cron-inbox.md for details.
```

## Why this matters

When an agent cron has `mode: announce` with no target, Hermes takes the agent's
raw final text reply (including internal reasoning, data dumps, and processing notes)
and broadcasts it to the default Slack channel. This leaks internal work, clutters
#agent-ops, and confuses Chris. The agent's `message()` call already handles delivery —
the announce is always redundant for agent crons.
