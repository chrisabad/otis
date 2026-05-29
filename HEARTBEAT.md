# HEARTBEAT.md — Otis

## Autonomous Run Protocol

When Paperclip triggers a run (on-demand or automation), Otis is not in an interactive session with Chris. These runs should complete deterministically and exit cleanly.

**Source credentials first:**
```bash
source /Users/openclaw/.openclaw/workspace/agents/otis/.env
```

## Checklist (execute in order, stop at first actionable item)

### 1. Check in_review issues assigned to Otis

```bash
source ~/.openclaw/workspace/agents/otis/.env
curl -s "http://127.0.0.1:3101/api/companies/0f6e2b9b-12b2-4306-9798-16325c788e6f/issues?assigneeAgentId=2b5f4e67-ca9a-44a2-ac1b-9ec5816d09e8&status=in_review" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY_AGE"
```

If Otis is acting as reviewer (not just returnAssignee), review and PATCH done/in_progress.

### 2. Check in_progress issues for stalled work

```bash
curl -s "http://127.0.0.1:3101/api/companies/0f6e2b9b-12b2-4306-9798-16325c788e6f/issues?assigneeAgentId=2b5f4e67-ca9a-44a2-ac1b-9ec5816d09e8&status=in_progress" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY_AGE"
```

Pick the highest-priority in_progress issue and advance it. If blocked, post a blocker comment.

### 3. Check for @Otis mentions needing response

Search open issues for recent comments @-mentioning Otis. Respond to any review or approval requests.

### 4. Nudge AGE-13339 sub-issues (SDLC simplification umbrella)

```bash
curl -s "http://127.0.0.1:3101/api/companies/0f6e2b9b-12b2-4306-9798-16325c788e6f/issues?parentId=0c1d84fb-e168-4c89-a421-3a5b176d4f72" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY_AGE" | \
  jq -r '.[] | "\(.identifier)\t\(.status)\t\(.priority)\t\(.title[0:60])"'
```

For any sub-issue still `todo` with no progress >48h:
- AGE-13346 (critical-path Quinn/Vera/PIX/STU GitHub Apps via AGE-13177): if AGE-13177 still `in_review`, escalate to Chris via Juno.
- AGE-13340–13345 (removals): can pick up directly or reassign to Hale (606b09a2 — owns `paperclip-issue-trigger`/recovery automation).
- AGE-13349 (policy template): platform engineering work; reassign to Hale if Otis doesn't pick up.
- AGE-13350 (AGE flip): unblocks as soon as AGE-13349 ships.
- See `memory/project_sdlc_simplification_age_13339.md` for full context and acceptance criteria.

### 5. Hire-roster GitHub Apps — all complete (2026-05-10)

All 10 new agents (Tess, Theo, Iris, Joss, Wren, Tate, Vale, Roe, Pell, Bea) registered with GitHub Apps; creds saved to `~/.openclaw/credentials/github-apps/<slug>/`. Orphan duplicates cleaned. Final naming: AGE=Quinn+Ellis, KAL=Wren+Quinn, WEE=Tate+Vera, FON=Tess+Roe, PIX=Iris+Pell, STU=Joss+Bea, DIA=Vale+Theo.

The callback handler (PID 69287, `:8765 --host 0.0.0.0`) and static server (PID 69313, `:8766`) can be killed when convenient. They're harmless if left running — the page is a status board now (mostly REGISTERED badges, no live registration buttons except cleanup tail).

**Remaining hire-related work (real implementation, not bookkeeping):**

a) **Hermes profile renames + scaffolding** — `~/.hermes/profiles/pix-reviewer/` should be renamed to `iris/` (and SOUL.md identity updated), `stu-reviewer/` to `joss/`. Wren, Vale, Roe, Pell, Bea need fresh profile dirs templated from Tess/Quinn. Tate already has a profile.

b) **executionPolicy templates per company** — KAL/WEE/FON/PIX/STU/DIA each need their default policy template updated with the named reviewer + approver participant agentIds. Without this, the per-company SDLC flips (AGE-13351..13356) can't advance.

Both are Axel's domain (agentos-sdlc skill). File proper hire-completion issues if not already filed.

### 6. Watch the adapter-incident threads

Three threads need polling each run until they close:

1. **AGE-13466** (Hale — plugin-gate rebuild for patch 043). Active blocker — without it, agents can still mark issues done with unmerged PRs. Nudge Hale if `in_progress` >24h with no work product.
2. **AGE-13510** (Hale — adapter_failed observability post-mortem). Lower priority but assigned to Hale post-13466. Confirm he picks it up after 13466 ships.
3. **PR #82 cascade** — AGE-13340 was rebumped to `in_review` after merge. Verify it cascades through Quinn → Ellis to `done`. If stuck >48h post-merge, Otis comments to push it through.

### 7. If nothing requires action

Post a brief status heartbeat on the AGE-12389 project tracker and exit.

## Exit Criteria

A run is successful when it completes all checks and exits. Do NOT wait for user input. Do NOT loop. Execute the checklist, post any required update, then exit.

**If Paperclip API is unreachable:** Exit immediately with a log message (don't fail — Paperclip may be restarting).

## Active Project

The Hermes-Native I&M project (AGE-12389) is the primary ongoing work. Remaining phases:
- AGE-12619: Webhook handler migration off OpenClaw gateway-2
- AGE-12494: Phase 5b skills migration
- AGE-12488: Phase 5 retire OpenClaw Juno infra (**BLOCKED** — 1-2 week soak until ~2026-05-17)
- AGE-12696: Infisical Phase 2 backup/restore drill
- AGE-12397: Phase 6 smoke-test refactor

## Smoke Test

For a smoke test run: source .env, ping the API (`GET /api/companies/...`), confirm HTTP 200, post a smoke-test comment on AGE-12389, exit 0.
