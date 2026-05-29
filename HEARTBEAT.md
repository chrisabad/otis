# HEARTBEAT.md — Otis

## Current Context (2026-05-29)

**Paperclip:** `https://paperclip-ezk7.srv1710374.hstgr.cloud/api`  
**AGE Company ID:** `f4593f38-24c0-481c-9771-3c52e74d16f5`  
**Auth:** `Authorization: Bearer $PAPERCLIP_API_KEY_AGE`  
**Board key (executionPolicy bypass):** `$PAPERCLIP_BOARD_KEY_CLOUD`  
**VPS:** `root@100.117.92.5` — SSH key at `~/.ssh/agentos_migration_2026-05-27` (local) or AWS Secrets Manager `agentos/otis/vps_ssh_key` (cloud)

## Active Phase: AGE Phase 2 Stabilization

Goal: make AGE autonomous, observable, and clean before onboarding FON. PRD at `memory/prds/2026-05-29-age-phase2-stabilization.md`.

### Backlog (execute highest priority first)

| ID | Priority | Title |
|----|----------|-------|
| AGE-85 | high | Wire cron triggers on all active AGE routines + fix stale maintenance references |
| AGE-80 | high | Smoke test issue-trigger wakeup path end-to-end on VPS (Orion assigned) |
| AGE-83 | high | Deploy notification service (port 8012) to VPS |
| AGE-84 | high | Deploy memory service (8010) + broker (8011) to VPS |
| AGE-77 | medium | Archive dispatch routine + enable topology audit |
| AGE-78 | medium | Enable Routine Health Monitor + PR-bearing-done audit routines |
| AGE-79 | medium | Deploy Redis + migrate broker dedup |
| AGE-81 | medium | Sync 5 missing skills to vera agent profile |
| AGE-82 | medium | Deploy mcporter + context7 MCP to VPS |
| AGE-86 | medium | Deploy post-exec hooks for structured run logging |
| AGE-88 | medium | Wire Langfuse tracing via LiteLLM env vars |
| AGE-87 | low | Audit VPS RAM + plan Graphiti/Neo4j deployment |

### Pre-existing distinct scope (not Phase 2)
- AGE-2: Set up FON company (next phase)
- AGE-5: Clean up Issue Event Router plugin
- AGE-24: GitOps for paperclip-issue-trigger
- AGE-34: Hermes context layer (broader scope)

## Checklist (autonomous run)

1. **Check AGE board for stuck/blocked items:**
   ```bash
   curl -s -H "Authorization: Bearer $PAPERCLIP_API_KEY_AGE" \
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
   If any agent is in `error` state: check profile ownership (chown 1000:1000), verify .env keys, wake agent.

3. **Advance highest-priority backlog item** if board is clean and agents are healthy.

4. **Exit cleanly.** Post a one-line status comment on the most recently touched issue.

## Exit Criteria

Complete all checks, post any required update, exit. Do NOT wait for user input. If Paperclip API is unreachable, log and exit 0.
