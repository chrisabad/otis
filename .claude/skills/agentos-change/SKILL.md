---
name: agentos-change
description: "Complete workflow for making any change to AgentOS config or context files — SOUL.md, AGENTS.md, HEARTBEAT.md, config.yaml, auth.json, skills/, memory/agents/*.md, or any file that affects agent behavior or routing. Read this skill before touching any covered file. Covers the AGE PaperClip issue gate, native executionPolicy review/approval, execution, and close-out. Use when any agent is about to modify agent infrastructure, config, routing, or shared skills."
version: 2.0.0
audience: shared
---
# AgentOS Change Skill

Every change to a covered file requires an open AGE PaperClip issue in `in_progress` state **before** touching the file. The issue carries a native `executionPolicy` (review + approval stages) that gates close-out — no separate @-mention pattern, no size classification.

## Covered Files

`SOUL.md` · `AGENTS.md` · `HEARTBEAT.md` · `config.yaml` · `auth.json` · `skills/` (any file) · `memory/agents/*.md` · any file that alters agent behavior or routing

---

## Step 1 — Open AGE PaperClip Issue

```bash
KEY="$PAPERCLIP_API_KEY_AGE"   # from ~/.hermes/profiles/<name>/.env
COMPANY_ID="0f6e2b9b-12b2-4306-9798-16325c788e6f"
AGENT_ID="$PAPERCLIP_AGENT_ID"

# Create issue — server auto-attaches default executionPolicy from project
# (review by Quinn, approval by Ellis, per AGE-13339 / patch 040). If you need
# a different reviewer/approver for this change, set executionPolicy explicitly.
curl -s -X POST "http://127.0.0.1:3101/api/companies/$COMPANY_ID/issues" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "<change title>",
    "description": "<objective + files + rationale>",
    "status": "todo",
    "priority": "medium",
    "assigneeAgentId": "'"$AGENT_ID"'",
    "projectId": "<project-id-or-null>"
  }'

# Move to in_progress
curl -s -X PATCH "http://127.0.0.1:3101/api/issues/$ISSUE_ID" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"status": "in_progress"}'
```

Capture `$ISSUE_ID` and `$ISSUE_UUID` — you need them for every subsequent step.

**DO NOT pass `X-Paperclip-Run-Id` for direct API calls.** It's a foreign key to `heartbeat_runs.id` and a fresh `uuidgen` value causes a 500 (`activity_log_run_id_heartbeat_runs_id_fk` violation). Only valid inside a real heartbeat run; if you're calling from a script or interactive session, omit the header.

**In-progress issue mutations from non-heartbeat agents** (e.g., Otis) are blocked with `401 {"error":"Agent run id required"}` — structural limitation tracked in AGE-12432. Workaround: use board-auth (omit `Authorization`) for close-out steps, attributing to local-board. Document any board-auth use in the close-out comment.

---

## Step 2 — Optional PRD

For changes with non-trivial scope or rationale that won't fit in the issue description, write a PRD to `memory/prds/YYYY-MM-DD-{slug}.md`. See [references/prd-template.md](references/prd-template.md) for the template. Reference the PRD path in the issue description.

PRDs are optional — the executionPolicy review stage gives the reviewer a chance to ask for one if the change is unclear.

---

## Step 3 — Optional Taskmaster Breakdown

For changes with >3 discrete tasks, spawn Claude Code to break the PRD into PaperClip sub-issues. See [references/taskmaster-prompt.md](references/taskmaster-prompt.md) for the exact prompt template.

Sub-issues go under the same AGE issue as `parentId`. Each sub-issue gets its own native executionPolicy via the project default.

---

## Step 4 — Execute

Before touching any file:
1. **Backup config files**: `cp ~/.hermes/config.yaml ~/.hermes/config.yaml.bak-$(date +%Y%m%d-%H%M%S)`
2. **Validate JSON** before applying: `tools/validate-config.sh`
3. Log the change in `memory/config-changes.md` with the AGE issue ID **before** triggering any restart

```markdown
### YYYY-MM-DD HH:MM PT
- **AGE Issue**: AGE-XX (http://127.0.0.1:3101/...)
- **Change**: What changed and why
- **Files**: List of files touched
- **Result**: Outcome / smoke test status
```

For gateway restarts — see [references/restart-protocol.md](references/restart-protocol.md).

For repo changes (any tracked AgentOS repo), use the `agentos-sdlc` skill's worktree workflow — never edit production trees directly.

---

## Step 5 — Close Out (review + approval gate)

```bash
# Move to in_review — server routes to the reviewer in the executionPolicy
curl -s -X PATCH "http://127.0.0.1:3101/api/issues/$ISSUE_UUID" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"status": "in_review", "comment": "Change complete. Files: ... Smoke test: OK"}'
```

The reviewer (typically Quinn at AGE) inspects the change; approves → routes to approver. The approver (typically Ellis at AGE) gives final sign-off → issue transitions to `done`.

**Comment is required** on every status transition while an executionPolicy is active. If you forget the comment, the API returns `400 {"error":"Stage decision requires a comment"}`.

**Verification gate:** after a write, check the activity log:

```bash
paperclipai activity list -C <company-id> --json | python3 -c "import json,sys; d=json.load(sys.stdin); [print(e['action'], e['actorType'], e.get('actorId')) for e in (d if isinstance(d,list) else d.get('items',[]))[:5]]"
```

The most recent entry should show `actorType=agent, actorId=<your agent ID>`. If it shows `actorType=user, actorId=local-board`, your auth fell through to board (Chris).

---

## Bootstrap deadlock

When a change touches the review system itself (the executionPolicy template, the reviewer/approver agents, the patches that make policy work), normal review can't gate it — the gate doesn't exist yet, or the gate is what's being fixed. In that case:

- File the issue normally (will land in `todo` with auto-attached policy).
- Get Chris's direct approval in conversation or via DM.
- Document the bootstrap-deadlock in the issue description and in any PR description.
- Treat Chris's approval as the standing reviewer + approver decision.

---

## Quick Reference

| Step | Required? |
|------|-----------|
| AGE issue (todo → in_progress) | ✅ always |
| Project (or explicit policy) on the issue | ✅ always — drives executionPolicy attachment |
| PRD in memory/prds/ | optional (reviewer may request) |
| Taskmaster sub-issue breakdown | optional (only if >3 discrete tasks) |
| config-changes.md entry | ✅ always |
| Backup before edit | config files always; other files when worth recovering |
| Reviewer + approver gate (executionPolicy) | ✅ always — server-enforced |
| Chris explicit approval | only on bootstrap-deadlock changes (the review system itself) |

**No more size classification.** Every change goes through the same uniform review+approve flow per AGE-13339. The reviewer judges scope at review-time and can ask for more (PRD, more sub-issues, more reviewers) if needed.
