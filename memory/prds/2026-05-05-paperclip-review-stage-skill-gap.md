# Paperclip review-stage advancement — skill gap + reviewer keys missing from Infisical

**Author:** Otis
**Date:** 2026-05-05
**Issue:** AGE-XXXXX (this PRD)
**Related:** AGE-12623 (originating bug report — Quinn unable to advance review stage)
**Severity:** High — every Large `agentos-change` peer-review gate is non-functional today

## Problem

The peer-review workflow introduced by `agentos-change` (Quinn reviews → Ellis approves on issues with `executionPolicy`) is currently broken end-to-end. AGE-12623 is the canonical example: Quinn correctly identified the @-mention, ran her checklist, and tried to advance the stage — but every API attempt failed with either `"API route not found"` or `"Only the active reviewer or approver can advance the current execution stage"`.

Two compounding root causes:

### Cause A — Skill gap

`~/.claude/skills/paperclip/SKILL.md` (the canonical paperclip skill, ~300 lines) does not document the execution-policy review/approval workflow at all. It teaches `paperclipai issue update <issueId> --status done` (line 99), which **silently fails on any issue with an `executionPolicy`**.

The skill never:
- Mentions `executionPolicy` or `executionState` once
- Warns that `issue update --status done` does not advance review-gated stages
- Documents the actual mechanism: `PATCH /api/issues/<id>` with `Authorization: Bearer <key>` + required `comment` field
- Links to `references/api-authentication.md` (where this *is* documented)

Result: when a reviewer agent looks up "how do I approve this," she finds nothing and starts guessing endpoints (`/approve`, `/review`, `/transition` — none exist). This is **the most common action** for Quinn and Ellis post-AGE-12554. The skill omission is the single biggest cause.

### Cause B — Reviewer keys never made it into Infisical

The Infisical migration (AGE-12590, complete 2026-05-05) seeded per-agent secrets at `/age/<agent>/` by scraping `~/.openclaw/workspace/agents/<name>/.env` and `~/.hermes/profiles/<name>/.env`. But Quinn's bearer token was stored in `~/.openclaw/workspace/agents/quinn/api-key.txt` — outside any `.env` — so the migration skipped it.

Consequences:
- `~/.openclaw/workspace/agents/quinn/.env` has only Infisical bootstrap creds (no `PAPERCLIP_QUINN_API_KEY`)
- `~/.hermes/profiles/quinn/.env` (refreshed every 30 min from Infisical) has zero `PAPERCLIP_*` entries
- Quinn's `AGENTS.md:39-41` claims `PAPERCLIP_QUINN_API_KEY` lives in `.env` — that env var does not exist anywhere in her process environment
- Even if Quinn knew the right endpoint, `Authorization: Bearer $PAPERCLIP_QUINN_API_KEY` would expand to empty, returning the same "Only the active reviewer or approver…" error

Same problem is likely true for Ellis (we should verify).

## Proposed fix — Two phases

### Phase A — Seed reviewer keys into Infisical (env config drift)

1. Read each reviewer agent's existing `pcp_*` token from `~/.openclaw/workspace/agents/<name>/api-key.txt`
2. Upload to Infisical at the agent's per-agent path:
   - `/age/quinn/PAPERCLIP_QUINN_API_KEY = <token>`
   - `/age/ellis/PAPERCLIP_ELLIS_API_KEY = <token>`
3. Trigger `infisical-refresh-all.sh` so the new keys flow to `~/.hermes/profiles/<name>/.env` immediately
4. Verify by reading `~/.hermes/profiles/quinn/.env | grep PAPERCLIP_QUINN_API_KEY`

**Bootstrap-deadlock note:** Quinn cannot review this phase, since the fix IS giving her the ability to review. Per `feedback_peer_review_bootstrap_deadlock.md`, escalate Phase A approval to Chris directly. Phase B can flow through the normal Quinn → Ellis path once Phase A lands.

### Phase B — Document execution-policy advancement in the paperclip skill

Edit `~/.claude/skills/paperclip/SKILL.md` to add a section "Advancing review/approval stages on execution-policy issues" with:

- The error message reviewers will see if they call `issue update --status done` on a gated issue
- The canonical pattern: `PATCH /api/issues/<id>` + `Authorization: Bearer $PAPERCLIP_<AGENT>_API_KEY` + `{"status":"done","comment":"..."}` body
- Required-comment rule (returns 400 if comment is missing)
- Pointer to `references/api-authentication.md` for the full reference

Per `project_shared_skill_strategy_d_hybrid.md`, the canonical skill home is the `agentos-skills` repo (option-e). Write the change locally first, then replicate to the shared repo as part of the standard write-local/read-canonical flow.

Also consider sister fixes (out of scope but worth flagging):
- Ellis-specific docs (approval stage is structurally identical to review but worth a callout)
- Quinn's `AGENTS.md` should reference the new skill section once it exists, so future Quinn sessions see the guidance during startup

## Acceptance criteria

- Quinn's next heartbeat after this lands can successfully advance a review stage on a test issue (`PATCH …/issues/<id>` + Bearer + comment → `executionState.status` transitions correctly)
- Ellis can advance an approval stage from `in_review` → `done`
- `~/.claude/skills/paperclip/SKILL.md` contains an executionPolicy section that a fresh agent could follow without consulting the references file or grepping source
- AGE-12623 (the originating issue) gets unstuck and reaches its terminal state

## Out of scope

- Refactoring the `agentos-change` skill itself (separate concern; that skill's review-window logic is correct, the bug is in the operator-side toolkit it implicitly depends on)
- Cross-fork PR to upstream `paperclipai` (no server change required — endpoints all exist)
- Migrating other agents that don't currently participate in peer review

## Risks

- **Phase A bootstrap deadlock** if I try to put Phase A through normal review — Chris must approve directly
- Replicating the skill change to `agentos-skills` repo could collide with in-flight Phase 5b (AGE-12494) — coordinate with whoever's driving that
- Quinn's `api-key.txt` token may be stale; verify it still authenticates as agent `334294f1-…` before seeding it into Infisical

## Test plan

1. Pick a low-stakes test issue; attach an `executionPolicy` with Quinn as reviewer
2. From Quinn's process environment (post-Phase-A), run `curl -X PATCH …/issues/<test-id> -H "Authorization: Bearer $PAPERCLIP_QUINN_API_KEY" -d '{"status":"done","comment":"test"}'`
3. Confirm `executionState.lastDecisionOutcome=approved` and stage advances to Ellis's approval slot
4. Repeat from Ellis with `$PAPERCLIP_ELLIS_API_KEY`
5. Once both pass, retroactively close AGE-12623 by Quinn following the now-correct flow
