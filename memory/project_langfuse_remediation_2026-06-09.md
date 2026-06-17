# Langfuse Remediation + Fleet Stabilization (2026-06-09)

## Problem
Fleet was paused due to runaway Ollama Cloud usage. Root causes:
1. **Langfuse 3.x crash** — `langfuse↔opentelemetry` version incompatibility causing all runs to exit `adapter_failed` after adapter cleanup (see `incident_age_langfuse_crash_and_ollama_quota.md`)
2. **fleet-integrity-monitor.sh** — installed on 2026-06-08 to strip Langfuse from enabled list and re-comment creds; was actively reverting any manual re-enablement every 3 minutes
3. **Credential pool exhaustion** — key-a (kaleidoscope) hit "extra usage auto reload monthly max"; pool showed "no available entries" because both keys were marked exhausted in-session
4. **sessionKeyStrategy=issue** — Axel was resuming 139-message (~32k token) session on every run, burning quota

## Fixes Applied

### Hermes + Langfuse Upgrade (VPS)
- hermes-agent: 0.15.2 → 0.16.0
- langfuse: 3.15.0 → 4.7.1 (rewrote otel integration; `flush()` and `use_span()` crash-free)

### Fleet-integrity-monitor.sh Update
- Removed rules 2 (strip langfuse from config.yaml enabled) and 3 (comment out .env creds)
- File: `/opt/agentos-monitor/fleet-integrity-monitor.sh`
- Backup at `.bak-langfuse-unblock-20260609`
- Original rules were correct for langfuse 3.x but are now blockers with 4.7.1

### Langfuse Plugin Re-enabled Fleet-wide
- All 17 profiles now have `observability/langfuse` in `plugins.enabled`
- All .env files have HERMES_LANGFUSE_* creds uncommented (removed `# integrity-off` prefix)
- Langfuse server: `https://langfuse-lugt.srv1724463.hstgr.cloud`

### Credential Pool (key-b)
- Added key-b (`93004d67b97047b9...`) to all 18 profiles as manual pool entry
- Pool: round_robin strategy, 2 entries (key-a from env, key-b manual)
- key-b stored in AWS SM `agentos/ollama/key-b`
- Pool rotation works in-session; if first call exhausts key-a, rotates to key-b

### sessionKeyStrategy Fix
- Axel: `sessionKeyStrategy: run` (each run starts fresh, not resuming 32k token session)
- Other AGE agents pending similar fix

## Canary Validation (Axel, 2026-06-09 ~21:37-21:48 UTC)
- 8 consecutive `succeeded` runs, 0 `adapter_failed`
- Plugin discovery: "1 found, 1 enabled" ✓
- Langfuse traces at `https://langfuse-lugt.srv1724463.hstgr.cloud`: 3 traces at 21:48 UTC ✓
- Pool entries: both keys healthy, key-b surviving runs ✓

## Fleet Status Post-Fix
- AGE agents (Axel, Juno, Ellis): active (idle), Langfuse enabled
- PER agents (Juno, Hollis, Nell, Morgan): still paused — Langfuse configs ready
- FON agents (Juno, Willa, Piper): still paused — Langfuse configs ready
- KAL agents (Tess): still paused — Langfuse configs ready

## Key Notes
- Honcho memory provider is failing "Payment required" — non-blocking warning
- The "no available entries (all exhausted or empty)" pool error during the failure storm (17:48 UTC) was because both keys were at monthly max SIMULTANEOUSLY; the fix was fixing key-a's monthly limit resetting + having key-b as hot standby
- fleet-integrity-monitor still runs every 3 minutes; rules 1 (--continue strip), 4 (corruptor disable), 5 (recovery storm breaker), 6 (zombie process kill) are still active and valid

## Fleet Unpause (2026-06-09 ~22:xx UTC)
- All 4 companies fully unpaused: AGE, FON, PER, KAL
- All agents idle/running; no run failures observed after unpause
- `OTEL_SERVICE_NAME=<agent_name>` added to all 17 profile .env files

## Langfuse userId Fix (2026-06-09)
**Problem:** Langfuse dashboard showed `userId: null` for all traces — the plugin's
`propagate_attributes()` call never set `user_id`, so traces couldn't be grouped/filtered by agent.

**Fix:** Patched `/opt/hermes-venv/lib/python3.12/site-packages/plugins/observability/langfuse/__init__.py`
- Backup at `__init__.py.bak-userid-20260609`
- Changed `propagate_attributes(session_id=..., trace_name=..., tags=[...])` to include:
  `user_id=os.getenv("OTEL_SERVICE_NAME") or os.getenv("HERMES_AGENT_NAME")`
- `OTEL_SERVICE_NAME` is already set per-agent in every profile's .env (e.g. `axel`, `juno`, `ellis`)
- `hermes-gateway` service restarted after patch; new runs will emit traces with `userId=<agent_name>`

**Expected dashboard result:** Langfuse Users view now shows agent names; traces can be filtered by agent.

**Note:** Patch is to the installed venv package, NOT to the Hermes source repo. If Hermes is upgraded,
this patch must be re-applied or the fix submitted upstream to the Hermes langfuse plugin.

## Pending
- AGE-784 (timeout watchdog) still in_progress for Axel to investigate
- Honcho credits: needs billing attention (not urgent, memory is degraded but not broken)
- AGE-771 [CRITICAL] Rotate GitHub bot tokens — still in_review
- Submit `user_id` fix upstream to Hermes langfuse plugin source
