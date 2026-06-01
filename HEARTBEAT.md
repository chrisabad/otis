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

**Ollama keys — connection pool (2026-06-01).** All agents now have BOTH account keys in their `ollama-cloud` credential pool (`hermes auth list`). Primary key from `.env`; secondary added via `hermes auth add`. On 401/exhaustion hermes auto-rotates to the secondary — no run failure. Accounts: kaleidoscope (chris@kaleidoscope.studio) key `9262d8…` = primary for Juno/Quinn/Vera/Supervisor/Dex; chrisabad (chrisabad@gmail.com) key `bd15e8…` = primary for Axel/Ellis/Orion. To add a new key to all agents: `for agent in juno quinn vera supervisor dex axel ellis orion; do HERMES_HOME=/opt/hermes-profiles/$agent /opt/hermes-venv/bin/hermes auth add ollama-cloud --type api-key --api-key <key> --label <name>; done`. To clear a stale `exhausted` state: edit `auth.json` in the profile dir, null out `last_status`/`last_error_*`/`secret_fingerprint` for the affected entry. No secret-sync on the box — `.env` edits and `auth.json` edits are durable.

**Run timeout.** Orchestration/impl agents (Juno/Axel/Ellis) `adapter_config.timeoutSec=600` (others default 300); legit multi-step work was hitting the 300s wall (`timed_out`).

**Agent routing = OUR plugin, not native.** Per-company role routing lives in `kaleidoscope-issue-trigger`'s `/docker/paperclip-ezk7/data/plugins/kaleidoscope-issue-trigger/routing-rules.json` (host-durable). `getAgentId(companyId,role)` reads it at module load → **edits need a container restart to reload**. The deprecated `dispatcher` role funneled all work through Juno (single-concurrency) → choke. Removed fleet-wide 2026-05-30 (AGE live; FON + WEE/KAL/DIA/PIX/STM/PER/AGE-local **staged — apply on next restart**). `workflow.dispatchRequired` is vestigial (never read). AGE roles now: implementer=Orion, reviewer=Ellis, approver+orchestrator=Juno. Full code-level removal of dead dispatcher-wakeup logic → plugin PR (Axel).

**Concurrency.** Implementation agents default `maxConcurrentRuns=1` (avoids concurrent VPS file/git conflicts). Axel bumped to **2** on 2026-05-30 (backlog of independent tasks + headroom: load ~0.2/2cpu, ~5.9GB free); verified no conflicts. Bump cautiously; watch for `lock`/`git`/`conflict` in stderr.

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
- **AGE-153** (Axel): item 3 = comment checkout-auth 401 (adapter prompt-template needs `x-paperclip-run-id`; new patch 058 + PR) + the `Session not found: from` `--resume` bug (item 4). Code-level dispatcher removal also lands here.
- **AGE-155** (Axel): document cloud stabilization in agentos-docs (runbook + provider invariant).
- **Staged routing changes** (FON + 6 others) apply on the **next container restart** — make sure a restart happens during FON standup.
- **Monitoring does NOT auto-carry across machines** — re-run the checklist below (storm tripwire) to re-establish the watch; consider bumping Axel→3 if its queue stays deep and clean.
- Local auto-memory (provider-inference, AGE-115 cap, routing-rules) is per-machine; the durable copies are this runbook + Paperclip issues AGE-95/115/153/155.

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
