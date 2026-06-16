---
name: sentry
description: Sentry error tracking for AgentOS. Use when you need to query Sentry issues, capture errors programmatically, or verify that events are flowing to the agentOS project.
version: 1.0.0
audience: shared
---
# Sentry — AgentOS Integration

## Project details
- Org: `kaleidoscope-js`
- Project slug: `agent-os`
- UI: https://kaleidoscope-js.sentry.io/projects/agent-os/
- DSN: stored in workspace `.env` as `SENTRY_DSN`
- Auth token: `SENTRY_AUTH_TOKEN` in workspace `.env`

## Capture utility: `tools/sentry_capture.py`
Implemented as part of AGE-181. Provides:

### Import API
```python
import sys
sys.path.insert(0, '/home/hermes/.hermes/workspace/tools')
from sentry_capture import configure_sentry, capture_error, capture_cron_failure, capture_agent_error, capture_budget_exceeded

configure_sentry()  # call once at script start

# Capture arbitrary exception
capture_error(exc=my_exception, tags={"agent": "axel"})

# Capture cron failure
capture_cron_failure(cron_name="my-cron", error_msg="...", agent="axel")

# Capture agent runtime error (used by run-health-watchdog)
capture_agent_error(agent="finn", error_msg="...", run_id="abc12345", classification="systemic")

# Capture budget exceeded event (for future LiteLLM webhook)
capture_budget_exceeded(agent="marlowe", model="pro", budget_type="litellm")
```

### Standalone usage
```bash
# Run integration test
python3.13 tools/sentry_capture.py --test

# Capture one-off error
python3.13 tools/sentry_capture.py --error "Something broke" --agent axel
```

## Query Sentry via API (ops workflow)
```bash
source /home/hermes/.hermes/workspace/.env

# List issues in agentOS project
curl -s "https://sentry.io/api/0/projects/kaleidoscope-js/agent-os/issues/?limit=10" \
  -H "Authorization: Bearer $SENTRY_AUTH_TOKEN" | python3 -c "
import json,sys
issues = json.load(sys.stdin)
for i in issues:
    print(i['id'], i['level'], i['title'][:80], 'count:', i['count'])
"

# Get issue details
curl -s "https://sentry.io/api/0/issues/{issue_id}/" \
  -H "Authorization: Bearer $SENTRY_AUTH_TOKEN" | python3 -m json.tool
```

## Integration points (what sends to Sentry)
1. **`tools/run-health-watchdog.py`** — imports `sentry_capture`, captures all `phase=error` gateway log entries. Runs every 20 min via cron.
2. **`tools/sentry_capture.py`** — standalone utility, can be imported by any script.
3. **Future:** LiteLLM budget webhook → `capture_budget_exceeded()`

## Tags used for filtering
- `agent`: which agent triggered the error (axel, finn, juno, etc.)
- `error_type`: `agent_runtime_error` | `cron_failure` | `budget_exceeded`
- `classification`: `recoverable` | `systemic` | `unknown`
- `cron`: cron job name (for cron failures)
- `run_id`: short Hermes run hash
- `source`: always `agentOS`

## Reliability rules
- `sentry_capture.py` has graceful degradation — if SDK missing or DSN absent, it logs a warning and continues (never crashes callers)
- All captures are fire-and-forget; callers are not blocked
- Run `--test` after any major change to verify events flow through
