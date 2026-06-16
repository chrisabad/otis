---
name: agentos-smoke-test
description: Smoke-test AgentOS by triggering on-demand heartbeat runs across agents, grouped by company and staggered to avoid flooding the gateway. Use when verifying agents are reachable after a gateway restart, config rollout, model/provider key swap, or when investigating why agents aren't picking up issues. The roster is enumerated live from Paperclip — no hardcoded agent list. Reports per-agent pass/fail/skip and an overall summary.
version: 1.0.0
audience: shared
---
# AgentOS Smoke Test

Validate that agents across companies can complete an on-demand heartbeat run end-to-end. The skill triggers heartbeats one at a time per company, polls Paperclip for the run's terminal status, and reports pass/fail/skip.

## When to use

- After a gateway restart, model/provider key swap, or config rollout (verify nothing broke broadly)
- After a Paperclip patch (verify scheduler/heartbeat path is healthy)
- Investigating "agents aren't picking up issues" — does heartbeat work at all?
- Pre/post maintenance window sanity check

Do not use this for issue-driven workflows — it bypasses the issue trigger and pings the agent with no work to do, just to verify the round-trip.

## How it works

1. Enumerates companies via `paperclipai company list --json`.
2. For each company, lists agents via `paperclipai agent list -C <id> --json`.
3. Filters to agents where `runtimeConfig.heartbeat.enabled` or `wakeOnDemand` is true. Others (e.g. the generic `Claude` agent) get skipped — the gateway returns "Heartbeat invocation was skipped" for them.
4. Triggers `paperclipai heartbeat run -a <id> --source on_demand --trigger manual --json --timeout-ms 1000` (returns immediately with a run ID).
5. Polls `GET /api/heartbeat-runs/<runId>` until `status != running`.
6. Records `completed` → PASS, `timed_out`/`failed`/`error` → FAIL, otherwise SKIP/FAIL.
7. Sleeps `--stagger` seconds between agents within a company; runs companies sequentially by default.

## Usage

```bash
~/.claude/skills/agentos-smoke-test/scripts/smoke-test.py [flags]
```

Common invocations:

```bash
# Smoke all companies, default 8s stagger, sequential
smoke-test.py

# Just AGE (the company most likely to break first)
smoke-test.py -C "AgentOS Infrastructure"

# Two companies by substring
smoke-test.py -C WEE -C FON

# Specific agents by name substring or id prefix (case-insensitive, repeatable).
# Spans every company unless -C is also given. Useful when targeting a small set
# of agents that live in different companies (e.g. the three CTOs).
smoke-test.py -a willa -a rue -a finn

# Tighter stagger when you're in a hurry and load is light
smoke-test.py --stagger 4

# Companies in parallel (see caveat below)
smoke-test.py --parallel-companies

# Enumerate without triggering — verify roster + filters first
smoke-test.py --dry-run

# Per-agent poll budget (default 600s; Reed-class agents can take 5+ min)
smoke-test.py --timeout 900

# Test ONLY process-adapter agents (debugging script-based agents — they're
# excluded by default because their scripts have historically rotted; see AGE-12102):
smoke-test.py --adapter process

# Test ONLY process agents in one company (typical debug pattern):
smoke-test.py --adapter process -C "AgentOS Infrastructure"

# Test every adapter type, no filtering:
smoke-test.py --all-adapters
```

Filter strings match company shortname/name/id case-insensitively (e.g. `WEE`, `Weekend`, or the UUID prefix all match the Weekend company).

`-a/--agent` matches against agent name (substring, case-insensitive) or id (prefix, case-insensitive). Repeatable. Combine with `-C`/`--adapter` if you want — filters AND together.

## Recommended cadence

- **Default** for "is everything healthy": run with no flags. Sequential keeps gateway load predictable; ~8s stagger leaves room for the prior run to release session locks before the next starts.
- **AGE-only** after touching infra: `-C "AgentOS Infrastructure"` exercises the company most exposed to gateway/config breakage.
- **Tight loop during incident triage**: `--stagger 4 --timeout 60` to fail fast and move on.

## Auth model

The smoke test uses **two per-agent auth tiers** — no board key required for normal runs.

### Tier 1: Enumeration (per-company Otis key)

`paperclipai agent list -C <company>` uses Otis's per-company key for that company.

Lookup order:
1. `~/.paperclip/context.json` — profiles map `companyId` → `apiKeyEnvVarName`
2. The named env var, resolved against process env first, then `~/.hermes/profiles/otis/.env`

If lookup fails for a company, smoke-test falls back to board auth and reports under `==> Auth fallbacks`. Only `paperclipai company list` always uses board auth (fleet-wide visibility — can't scope to one company).

### Tier 2: Heartbeat triggers (per-agent provisioned key)

The Paperclip API enforces "Agent can only invoke itself" — cross-agent heartbeat triggers are rejected unless you're the board user or the target agent. We use the latter:

Each agent has a pre-minted "smoke-test" API key stored in `~/.hermes/profiles/otis/smoke-agent-keys.json` (agent_id → token). The trigger authenticates as the target agent using that key.

**One-time setup (requires board auth via `default` profile):**
```bash
smoke-test.py --provision-keys
```

This mints keys for all heartbeat-enabled agents across all companies and saves them locally. Run again to provision newly added agents (existing entries are skipped). After provisioning, subsequent smoke runs need no board auth at all.

When you see `==> Auth fallbacks` reporting a missing smoke key, run `--provision-keys` to fill the gap.

## Caveats

- **Two-gateway architecture**: AGE company is bound to gateway-1 (:18790); everything else routes through gateway-2 (:18793). Both gateways share the main agent's `sessions.json`. `--parallel-companies` can hit `SessionWriteLockTimeoutError` under contention — keep companies sequential unless you're explicitly stress-testing.
- **Costs real LLM tokens**: each heartbeat is a real agent run. A full sweep of ~30 testable agents at default settings spends real money. Prefer narrowing with `-C` when you have a target.
- **`--include-disabled`**: agents with both `heartbeat.enabled=false` and `wakeOnDemand=false` (e.g. the generic `Claude` agent) are excluded by default. Use this flag only if you specifically want to verify the "skip" path; they will always come back as SKIP.
- **Terminal statuses**: `completed` = PASS. `timed_out` may be a real failure (LLM hung) or a slow-but-fine run that exceeded the per-agent timeout — the run keeps going server-side. `failed`/`error` includes a short error excerpt.
- **`process` adapter agents are excluded by default.** Their underlying scripts have historically rotted (AGE-12102/12139/12140/12229) — running them in the default sweep produces a wall of `adapter_failed` noise that drowns out signal from the rest of the fleet. To debug them specifically, run `smoke-test.py --adapter process` (optionally with `-C "AgentOS Infrastructure"` to scope to one company). To test everything regardless of adapter, use `--all-adapters`.

## Adapter types in the fleet

The default filter (`hermes_local`, `codex_local`) covers all real LLM-backed agents. The breakdown:

- **`hermes_local`** — Hermes-driven LLM agents (most of the fleet). The primary production runtime.
- **`codex_local`** — Codex-driven LLM agents. Currently includes the AGE Phase-2 shadow agents (Cass-CDX/Remi-CDX/Lev-CDX/Nomi-CDX); they may return `Agent is not invokable in its current state` until fully provisioned.
- **`process`** — Shell/python script agents. Excluded by default. **Use `--adapter process` to debug these as a separate exercise** — they need their scripts restored and are tracked under their own AGE issues.
