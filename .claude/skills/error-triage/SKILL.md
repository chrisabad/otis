---
name: error-triage
description: "System-level error triage — catches errors from message-delivery failures, gateway logs, cron failures, tool errors, and Paperclip API errors, then investigates and resolves or escalates autonomously. Use when a system error needs autonomous handling rather than manual investigation."
version: 1.0.0
audience: shared
---
# Error Triage Skill

## Context
System-level error triage pipeline. Catches errors from all sources, investigates autonomously, resolves or escalates. "Sentry on autopilot."

## Error Queue
All errors flow to `memory/error-queue.md`. This is the single source of truth for unresolved errors.

## Sources

### 1. Message delivery failures (`message_sent`)
- Triggered by Hermes's `message:sent` internal hook when `success === false`
- Handler at `tools/error-hook-handler.js` appends to error queue
- Common causes: wrong channel ID, missing `blocks` param, auth issue, rate limit

### 2. Gateway logs (`gateway_log`)
- Scanned every 15 minutes by `error-log-scanner` cron
- Location: `~/.hermes/logs/`
- Filter: ERROR-level entries, provider auth failures, rate limits, webhook errors

### 3. Cron failures (`cron_failure`)
- Detected via `active-tasks.md` stale entries (heartbeat sweep)
- Also: `~/.hermes/cron/jobs.json` — check for jobs with failed last execution

### 4. Tool call errors (`tool_error`)
- Agents write to error queue when they hit unrecoverable tool errors
- Instead of posting `:warning:` to Slack → append to `memory/error-queue.md`

### 5. PaperClip API errors (`paperclip_api`)
- Agents write to error queue on 401, 500, or unexpected API responses
- Common: missing `x-paperclip-run-id`, wrong company key, schema validation

### 6. Webhook errors (`webhook`)
- Part of gateway log scan — filter for `webhook.error` entries
- Common: malformed payload, unknown route, auth failure

## Triage Pipeline

For each `new` entry in the error queue:

### Step 1 — Dedup
```bash
# Check if same dedup key appeared in last 24h
grep -c "[DEDUP_KEY]" memory/error-queue.md
```
- If duplicate and already investigated → mark `duplicate`, skip
- If 3+ occurrences → flag as recurring pattern, escalate

### Step 2 — Classify

| Classification | Signals | Action |
|---|---|---|
| **Transient** | Rate limit, timeout, network error, single occurrence | Mark `transient`. Auto-close if no recurrence in 1h. |
| **Config** | Auth failure, "channel unavailable", missing env var, wrong ID | Check config files. Attempt fix. |
| **Bug** | Consistent repro, code-level issue, schema mismatch | Create PaperClip issue. Investigate source code. |
| **Expected** | Known limitation, documented in TOOLS.md or principles | Mark `expected`. Log once. |

### Step 3 — Investigate

**For config issues:**
1. Check `~/.hermes/config.yaml` — channel bindings, account IDs, agent list
2. Check `.env` files — API keys, tokens
3. Check `memory/paperclip-setup.md` — agent keys, company IDs
4. Check auth files — `~/.hermes/auth.json`, gog credentials

**For bugs:**
1. Check Hermes source at `~/repos/hermes/src/` — relevant module
2. Check PaperClip source at `~/.npm/_npx/*/node_modules/paperclipai/` and `@paperclipai/server`
3. Check relevant skill files for incorrect API patterns
4. Search `memory/learnings.md` and `memory/fault-log.md` for prior occurrences

**For patterns:**
1. Search error queue for same dedup key — how many times, over what period?
2. Check if there's a principle (P_*) that should have prevented this
3. Check if an agent context file is missing instructions

### Step 4 — Resolve or Escalate

**If fixable:**
- Apply the fix (config change, skill update, agent context update)
- Mark entry `resolved` with description of fix
- Log to `memory/learnings.md`
- If it reveals a generalizable pattern → add to `memory/principles.md`

**If not fixable by Juno:**
- Create PaperClip issue with: error text, diagnosis, what was tried, recommendation
- Mark entry `escalated`

**If recurring (3+ in 24h):**
- Surface to Chris via #agent-ops using `chris-facing-message` skill format:
  - What the error is (plain English)
  - How many times it's happened
  - What I've investigated
  - What I recommend

## Error Queue Entry Lifecycle

```
new → investigating → resolved
new → duplicate (skip)
new → transient (auto-close after 1h)
new → expected (log once, close)
new → investigating → escalated (PaperClip issue created)
```

## Cron Jobs

### error-log-scanner (every 15 minutes)
Scans gateway logs for ERROR entries. Appends new errors to queue.

### error-triage-processor (every 30 minutes)
Processes all `new` entries through the triage pipeline. Belt-and-suspenders for the heartbeat sweep.

## Appendix: Writing to the Error Queue

Agents should use this pattern to report errors:
```bash
printf '\n### %s\n- Source: tool_error\n- Agent: [agent_name]\n- Error: [error message]\n- Context: [what was being attempted]\n- Severity: auto\n- Status: new\n- Dedup key: tool_error:[fingerprint]\n- Resolution: pending\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> /home/hermes/.hermes/workspace/memory/error-queue.md
```
