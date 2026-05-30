# HEARTBEAT.md — Otis

## Current Context (2026-05-30)

**Paperclip:** `https://paperclip-ezk7.srv1710374.hstgr.cloud/api`  
**AGE Company ID:** `f4593f38-24c0-481c-9771-3c52e74d16f5`  
**Auth:** `Authorization: Bearer $PAPERCLIP_BOARD_KEY_CLOUD` (board key — use for all cloud operations)  
**VPS:** SSH is Tailnet-only (`root@100.117.92.5`). **Cloud sessions cannot SSH** — operate over the Paperclip HTTPS API and delegate VPS shell work to **Axel** (runs on the VPS). For direct shell, use a local Tailnet session. Key: `~/.ssh/agentos_migration_2026-05-27` or AWS Secrets Manager `agentos/otis/vps_ssh_key`.

## Cloud Operational Runbook (hard-won, 2026-05-30)

**Embedded Postgres access** (DB is container-local, port not host-exposed):
```bash
ssh -i ~/.ssh/agentos_migration_2026-05-27 root@100.117.92.5 \
  'docker exec paperclip-ezk7-paperclip-1 node -e "<js using require(\"/usr/local/lib/node_modules/paperclipai/node_modules/pg\")>"'
```
Conn: `host 127.0.0.1 port 54329 user/pass/db = paperclip`. NOTE: `interval $1` can't be parameterized — use literal intervals in the JS string.

**Storm tripwire / kill-switch.** A recovery storm = `failed`/min climbing + `heartbeat_runs` row count ballooning. The ONLY reliable dispatch kill-switch is `UPDATE agents SET status='paused'` (NOT `paused_at` — dispatch gates on `status`). Re-enable with `status='idle'`.

**AGE-115 recovery circuit-breaker.** Host patches `056`/`057` in `/docker/paperclip-ezk7/patches/` (bind-mounted, auto-applied each boot) cap automatic recovery at 4 runs/2h then escalate to `blocked`. Patch format: `--- Target:` header + `MATCH:`/`REPLACE:` blocks; idempotent; non-fatal on MATCH drift.

**provider=auto invariant (critical for model changes).** Ollama-cloud agents MUST have `adapter_config.provider='auto'`. The hermes-paperclip-adapter infers provider from model-name prefix when provider isn't a VALID_PROVIDER (`'custom'` is ignored): `kimi`→kimi-coding, `glm-`→zai → request mis-routed off ollama.com → `401`. Audit: `/opt/agentos-tools/check-agent-provider.sh` (exit 0=clean). Set: `jsonb_set(adapter_config,'{provider}','"auto"')`.

**Ollama keys.** Sharded across agents in `/opt/hermes-profiles/<agent>/.env` (`OLLAMA_API_KEY`): key a (306c0e…) Juno/Quinn/Vera/supervisor; key c (bd15e8…) Axel/Ellis/Orion/diag. Key b (weekend.com) dropped (past-due). No secret-sync on the box — `.env` edits are durable.

**Run timeout.** Orchestration/impl agents (Juno/Axel/Ellis) `adapter_config.timeoutSec=600` (others default 300); legit multi-step work was hitting the 300s wall (`timed_out`).

## Active Phase: AGE Phase 2 Stabilization

Goal: make AGE autonomous, observable, and clean before onboarding FON. PRD at `memory/prds/2026-05-29-age-phase2-stabilization.md`.

### Stabilization status (2026-05-30)

The "401 storm" is resolved at root. Verified-live fixes: **AGE-95** (done) — Ollama key shard + the real root cause (provider mis-routing, see runbook); **AGE-115** (cap deployed, soaking) — recovery circuit-breaker patches 056/057; **AGE-153** (Axel) — items 1 (provider=auto check) + 2 (timeout 600s) done by Otis, item 3 (comment checkout-auth 401 → adapter prompt-template needs `x-paperclip-run-id` header, new patch 058 + PR) routed to Axel.

### Open backlog (draining autonomously via Juno→specialist routing)

Query live (don't trust this list): AGE todos as of 2026-05-30 were AGE-80, 84, 88, 94, 99, 104, 121, 152 (+ AGE-85 in_review). These drain through dispatch now that the 401 root cause is fixed — do NOT hand-work the queue; monitor and unblock.

### Pre-existing distinct scope (not Phase 2)
- AGE-2: Set up FON company (next phase)
- AGE-5: Clean up Issue Event Router plugin
- AGE-24: GitOps for paperclip-issue-trigger
- AGE-34: Hermes context layer (broader scope)

## Checklist (autonomous run)

1. **Check AGE board for stuck/blocked items:**
   ```bash
   curl -s -H "Authorization: Bearer $PAPERCLIP_BOARD_KEY_CLOUD" \
     "https://paperclip-ezk7.srv1710374.hstgr.cloud/api/companies/f4593f38-24c0-481c-9771-3c52e74d16f5/issues?limit=30" | \
     python3 -c "import sys,json; issues=json.loads(sys.stdin.read()); \
     [print(i['identifier'], i['status'], i['title'][:50]) for i in issues \
     if i['status'] not in ('done','cancelled','backlog')]"
   ```
   Investigate anything in `blocked` or `in_progress` > 24h with no recent activity.

2. **Check VPS agent health:**
   ```bash
   curl -s -H "Authorization: Bearer $PAPERCLIP_BOARD_KEY_CLOUD" \
     "https://paperclip-ezk7.srv1710374.hstgr.cloud/api/companies/f4593f38-24c0-481c-9771-3c52e74d16f5/agents" | \
     python3 -c "import sys,json; [print(a['name'], a['status']) for a in json.loads(sys.stdin.read())]"
   ```
   ```
   If any agent is in `error` state: check profile ownership (chown 1000:1000), verify .env keys, wake agent.

3. **Storm tripwire (local Tailnet sessions).** Check `failed`/min and `heartbeat_runs` row count (see runbook). If failing rapidly / rows ballooning: kill-switch `UPDATE agents SET status='paused'`, then diagnose (provider mis-route? key? recovery loop?). Also run `/opt/agentos-tools/check-agent-provider.sh` after any model change.

4. **Advance highest-priority backlog item** only if it needs Otis (planning/cross-cutting). Routine implementation drains via dispatch — don't hand-work the queue.

5. **Exit cleanly.** Post a one-line status comment on the most recently touched issue.

## Exit Criteria

Complete all checks, post any required update, exit. Do NOT wait for user input. If Paperclip API is unreachable, log and exit 0.
