# HEARTBEAT.md — Otis

## Current Context (2026-05-30)

**Paperclip:** `https://paperclip-ezk7.srv1710374.hstgr.cloud/api`  
**AGE Company ID:** `f4593f38-24c0-481c-9771-3c52e74d16f5`  
**Auth:** `Authorization: Bearer $PAPERCLIP_BOARD_KEY_CLOUD` (board key — use for all cloud operations)  
**VPS:** SSH is Tailnet-only (`root@100.117.92.5`). **Cloud sessions cannot SSH** — operate over the Paperclip HTTPS API and delegate VPS shell work to **Axel** (runs on the VPS). For direct shell, use a local Tailnet session. Key: `~/.ssh/agentos_migration_2026-05-27` or AWS Secrets Manager `agentos/otis/vps_ssh_key`.

## Cloud Operational Runbook (hard-won, 2026-05-30; updated 2026-06-09)

**Embedded Postgres access** (DB is container-local, port not host-exposed):
```bash
ssh -i ~/.ssh/agentos_migration_2026-05-27 root@100.117.92.5 \
  'docker exec paperclip-ezk7-paperclip-1 node -e "<js using require(\"/usr/local/lib/node_modules/paperclipai/node_modules/pg\")>"'
```
Conn: `host 127.0.0.1 port 54329 user/pass/db = paperclip`. NOTE: `interval $1` can't be parameterized — use literal intervals in the JS string.

**Storm tripwire / kill-switch.** A recovery storm = `failed`/min climbing + `heartbeat_runs` row count ballooning. The ONLY reliable dispatch kill-switch is `UPDATE agents SET status='paused'` (NOT `paused_at` — dispatch gates on `status`). Re-enable with `status='idle'`.

**AGE-115 recovery circuit-breaker.** Host patches `056`/`057` in `/docker/paperclip-ezk7/patches/` (bind-mounted, auto-applied each boot) cap automatic recovery at 4 runs/2h then escalate to `blocked`. Patch format: `--- Target:` header + `MATCH:`/`REPLACE:` blocks; idempotent; non-fatal on MATCH drift.

**provider=auto invariant (critical for model changes).** Ollama-cloud agents MUST have `adapter_config.provider='auto'`. The hermes-paperclip-adapter infers provider from model-name prefix when provider isn't a VALID_PROVIDER (`'custom'` is ignored): `kimi`→kimi-coding, `glm-`→zai → request mis-routed off ollama.com → `401`. Audit: `/opt/agentos-tools/check-agent-provider.sh` (exit 0=clean). Set: `jsonb_set(adapter_config,'{provider}','"auto"')`.

**Ollama keys — connection pool (2026-06-01).** All agents now have BOTH account keys in their `ollama-cloud` credential pool (`hermes auth list`). Primary key from `.env`; secondary added via `hermes auth add`. On 401/exhaustion hermes auto-rotates to the secondary — no run failure. Accounts: kaleidoscope (chris@kaleidoscope.studio) key `9262d8…` = primary for Juno/Quinn/Vera/Supervisor/Dex; chrisabad (chrisabad@gmail.com) key `bd15e8…` = primary for Axel/Ellis/Orion. To add a new key to all agents: `for agent in juno quinn vera supervisor dex axel ellis orion; do HERMES_HOME=/opt/hermes-profiles/$agent /opt/hermes-venv/bin/hermes auth add ollama-cloud --type api-key --api-key <key> --label <name>; done`. To clear a stale `exhausted` state: edit `auth.json` in the profile dir, null out `last_status`/`last_error_*`/`secret_fingerprint` for the affected entry. No secret-sync on the box — `.env` edits and `auth.json` edits are durable.

**Run timeout.** All agents `adapter_config.timeoutSec=1800`; wrappers use `timeout 1900` (100s margin above Hermes internal timeout). Raised 2026-06-11: deepseek-v4-flash at 30-100s/API call requires far more wall-clock than prior 3B models.

**Agent routing = OUR plugin, not native.** Per-company role routing lives in `kaleidoscope-issue-trigger`'s `/docker/paperclip-ezk7/data/plugins/kaleidoscope-issue-trigger/routing-rules.json` (host-durable). `getAgentId(companyId,role)` reads it at module load → **edits need a container restart to reload**. The deprecated `dispatcher` role funneled all work through Juno (single-concurrency) → choke. Removed fleet-wide 2026-05-30 (AGE live; FON + WEE/KAL/DIA/PIX/STM/PER/AGE-local **staged — apply on next restart**). `workflow.dispatchRequired` is vestigial (never read). AGE roles now: implementer=Orion, reviewer=Ellis, approver+orchestrator=Juno. Full code-level removal of dead dispatcher-wakeup logic → plugin PR (Axel).

**Concurrency.** Implementation agents default `maxConcurrentRuns=1` (avoids concurrent VPS file/git conflicts). Axel bumped to **2** on 2026-05-30 (backlog of independent tasks + headroom: load ~0.2/2cpu, ~5.9GB free); verified no conflicts. Bump cautiously; watch for `lock`/`git`/`conflict` in stderr.

**SSH key — local sessions.** Key is NOT reliably at `~/.ssh/agentos_migration_2026-05-27` across machines. Fetch from AWS SM on first use:
```bash
aws secretsmanager get-secret-value --secret-id agentos/otis/vps_ssh_key --region us-east-1 \
  --query SecretString --output text > /tmp/vps_key && chmod 600 /tmp/vps_key
# Then: ssh -i /tmp/vps_key -o StrictHostKeyChecking=no root@100.117.92.5
```

**Postgres settings (2026-06-09).** Applied via `ALTER SYSTEM` + `pg_reload_conf()`:
- `idle_in_transaction_session_timeout = 2min` — auto-kills zombie advisory lock holders (dispatch pile-up symptom)
- `statement_timeout = 2min` — safety net for runaway queries
- For intentional long ops (bulk DELETEs, index builds): prepend `SET statement_timeout = 0` in the same session. Use `CREATE INDEX CONCURRENTLY` to avoid table locks.

**Advisory lock pile-up symptom.** If UI is slow: check `SELECT state, count(*) FROM pg_stat_activity GROUP BY 1`. `idle in transaction` + ungranted locks = dispatch queue blocked. Fix: `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE state='idle in transaction'`. Now auto-healed by `idle_in_transaction_session_timeout`.

**DB bloat / heartbeat_runs purge.** Storm incidents generate 10k–100k failed rows fast. Purge pattern (FK graph requires order):
1. Delete child rows: `heartbeat_run_events`, `activity_log`, `environment_leases`, `finance_events`, `cost_events`
2. NULL FK refs in important tables: `issues`, `issue_comments`, `document_revisions`, `agent_task_sessions`, etc.
3. Delete `heartbeat_runs` WHERE terminal status + age cutoff
4. VACUUM FULL to reclaim disk
**Critical:** `heartbeat_runs.retry_of_run_id` and `heartbeat_runs.wakeup_request_id` MUST have indexes before bulk DELETE or it will take hours (seq scan per row). Indexes added 2026-06-09; verify with `\d heartbeat_runs`.

**Zombie process detection.** Agents occasionally spawn `grep -rl /` or `find /` from root filesystem — saturates CPU for days with no visibility. Check: `ps aux --sort=-%cpu | head -10`. Kill: `kill -9 <pid>`. Integrity monitor section 6 now auto-kills these after 5 min. Filed AGE-775 for permanent fix (wrapper timeouts + filesystem permission lockdown).

**Missing indexes (added 2026-06-09).** The following indexes were absent and added; if DB is ever recreated, re-apply:
`board_api_keys(key_hash, user_id)`, `agent_api_keys(key_hash, agent_id, company_id)`, `instance_user_roles(user_id)`, `"user"(email)`, `company_memberships(company_id, principal_id)`, `issue_labels(issue_id, company_id)`, `labels(company_id)`, `activity_log(agent_id)`, `activity_log(actor_type, actor_id)`, `document_revisions(document_id)`, `document_revisions(company_id, created_at DESC)`, `heartbeat_runs(retry_of_run_id)`, `heartbeat_runs(wakeup_request_id)`.

## Active Phase: AGE Phase 2 Stabilization

Goal: make AGE autonomous, observable, and clean before onboarding FON. PRD at `memory/prds/2026-05-29-age-phase2-stabilization.md`.

### Stabilization status (2026-05-30, late)

Fleet stable + productive: 0 failures/timeouts in recent windows, ~8 issues done/90min, no DB bloat. Verified-live fixes this session:
- **AGE-95 (done)** — Ollama key shard + the real 401 root cause = provider mis-routing (see runbook).
- **AGE-115 (cap deployed, soaking)** — recovery circuit-breaker patches 056/057.
- **Dispatcher funnel removed** — AGE live, fleet staged (see runbook); work now routes to specialists in parallel, not piling on Juno.
- **Otis terminated** from the agent roster (was `error`, no model; offboarded via `status=terminated`).
- **Axel maxConcurrentRuns 1→2** — draining its queue 2-at-a-time, no conflicts.

### Open threads (for the next session)
- **AGE-775** (CRITICAL, new 2026-06-09): Permission lockdown — agents must not write wrappers/config/env. Filesystem write lockdown + `timeout 600` in hermes wrappers + DB purge cron. Assign to Axel.
- **AGE-623**: Paperclip recovery must respect agent pause. Monitor storm-cap is interim.
- **AGE-624**: Langfuse stays OFF until crash is reproduced+fixed+verified.
- **~30 parked AGE issues**: Re-triage to resume AGE work (backlog/unassigned from Jun 8 storm cap).
- **`document_revisions` 297 MB**: Indexes added but content not purged. Storm-era revisions still present. Purge old revisions (keep last N per document).
- **`activity_log` 122 MB**: 152k rows, not purged. Age out rows older than 30 days.
- **AGE-153** (Axel): checkout-auth 401 + `Session not found: from` --resume bug.
- **AGE-155** (Axel): document cloud stabilization in agentos-docs.
- **Staged routing changes** (FON + 6 others) apply on the **next container restart**.
- **AGE-668**: Ollama credential pooling needs Hermes upgrade (v0.15.2 prunes manual pool creds).

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

3b. **Model config integrity check.** Verify the two-layer model setup hasn't drifted (see AGENTS.md "Model configuration" section):
   ```bash
   # Paperclip layer — all active agents must show deepseek-v4-flash
   docker exec paperclip-ezk7-paperclip-1 psql -h /tmp -p 54329 -U paperclip -d paperclip -t -c \
     "SELECT name, adapter_config->>'model' FROM agents WHERE status != 'terminated' ORDER BY name;"
   # Expected: deepseek-v4-flash for all agents except those with no model set (Otis, KAL Juno).

   # Hermes layer — only juno/juno-fon/juno-per/piper should show GLM
   for p in juno juno-fon juno-per piper axel ellis; do
     echo "$p: $(grep 'default:' /opt/hermes-profiles/$p/config.yaml | grep -v '#' | head -1)"
   done
   # Expected: juno*/piper → glm-5.1:cloud; axel/ellis → deepseek-v4-flash
   ```
   If anything shows `glm-5.1:cloud` in Paperclip adapterConfig, or `deepseek-v4-flash` in juno/piper
   Hermes profiles: file an AGE issue with label `model-drift` and fix it. Do NOT silently revert — the
   two-layer split is intentional (see AGENTS.md for rationale).

4. **Advance highest-priority backlog item** only if it needs Otis (planning/cross-cutting). Routine implementation drains via dispatch — don't hand-work the queue.

5. **Exit cleanly.** Post a one-line status comment on the most recently touched issue.

## Exit Criteria

Complete all checks, post any required update, exit. Do NOT wait for user input. If Paperclip API is unreachable, log and exit 0.
