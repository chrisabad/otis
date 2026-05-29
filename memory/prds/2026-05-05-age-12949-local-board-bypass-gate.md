# PRD: AGE-12949 — local-board bypass gate + credential scope audit

**Issue:** AGE-12949  
**Filed by:** Otis  
**Date:** 2026-05-05  
**Size:** Large (cross-repo, server-side security change)

---

## Objective

Prevent `local-board` credentials from silently bypassing `executionPolicy`
review/approval gates on Paperclip issues, and reduce `PAPERCLIP_BOARD_KEY`
exposure to only agents that legitimately need board-level access.

Root cause: Any agent with `PAPERCLIP_BOARD_KEY` in its resolved env can
authenticate as `local-board` (displayed as "Chris Abad") and PATCH
`status=done` on a policy-gated issue, skipping Quinn → Ellis entirely.
Observed on AGE-12936 — Axel silently closed it without review.

---

## Inputs

- Paperclip server source (`chrisabad/paperclip`, `server/src/`)
- Agent Infisical secret namespaces (each agent's resolved env)
- Existing `executionPolicy` state-machine logic in `issue-execution-policy.js`
- Activity log data to identify which agents have used local-board on gated issues

## Outputs

- Cross-fork PR to `chrisabad/paperclip`: server-side gate rejecting
  `local-board` PATCH on policy-gated issues with a clear 403
- Structured audit log / metric on every `local-board` write to a
  policy-gated issue
- Agent-by-agent list of who has `PAPERCLIP_BOARD_KEY` and whether they need it
- Infisical updates removing the key from agents with no orchestration role

---

## Phases

### Phase 1 — Server-side gate (high priority, blocks Phase 2)

In the `PATCH /api/issues/:id` handler, after `executionPolicy` is
resolved for the issue:

- If `executionPolicy != null` AND `actorType=user, actorId=local-board`:
  - Return `403 {"error": "local-board cannot mutate policy-gated issues. Use per-agent credentials."}`
- Allowed exemptions (explicitly listed, not inferred):
  - `PATCH executionPolicy` itself (adding/updating the policy, not a status transition)
  - Issue creation (`POST`, no policy set yet)
  - Read operations
- Add a structured log line on every `local-board` write attempt on a
  gated issue: `{ event: "local_board_gate_hit", issueId, actorId, action }`
- Test coverage in `server/src/__tests__/`:
  - `local-board` PATCH `status=done` on policy-gated issue → 403
  - Per-agent PATCH `status=done` with valid auth → normal flow
  - `local-board` PATCH `executionPolicy` on issue → allowed

### Phase 2 — Credential audit (parallel, medium priority)

Query Infisical for every agent namespace and list which ones have
`PAPERCLIP_BOARD_KEY` set. Classify each:

| Needs board key | Reason |
|-----------------|--------|
| Otis | Orchestrator — creates issues, runs smoke tests |
| Juno | CEO — queue groomer, approval decisions |
| (TBD) | Any other agent with a documented board-level need |

All other agents: flagged for removal.

### Phase 3 — Credential scope reduction (after audit approval)

Remove `PAPERCLIP_BOARD_KEY` from agents that don't need it via
Infisical. Stage: one agent at a time, verify one clean heartbeat after
each removal before continuing. Roll back immediately if a heartbeat fails
with an auth error.

---

## Constraints

- Server fix **must** go via cross-fork PR + Ellis approval (not the local
  patch system — `feedback_paperclip_changes_via_pr`)
- Must not break smoke-test paths or `agentos-smoke-test` skill
- `local-board` must still be able to: create issues (no policy set yet),
  read issues, set `executionPolicy` on a new issue
- Credential removal is irreversible at the Infisical level without manual
  re-add; stage carefully

---

## Success Criteria

- [ ] `local-board` PATCH on `status` of a policy-gated issue returns 403
- [ ] Server emits structured log event for each `local-board` write attempt on gated issue
- [ ] Test coverage in `server/src/__tests__/` for gate (pass + block cases)
- [ ] Audit complete: enumerated list of agents with `PAPERCLIP_BOARD_KEY` in env
- [ ] At least one non-orchestrator agent has `PAPERCLIP_BOARD_KEY` removed and runs a clean heartbeat

---

## Prior Art / References

- **AGE-12936** — bypass case that surfaced this gap (done)
- **AGE-12392** — Otis per-company identity setup, background on why board credentials are risky
- **AGE-12539** — executionPolicy auto-apply gap (related enforcement work)
- **AGE-12754** — Migrate plan-enforcement gate to native plan documents (future)
- **Patch 042** — Fixed the immediate WEE-Fen symptom (hermes adapter regex); this PRD addresses the systemic governance gap
- Memory: `feedback_paperclip_changes_via_pr`, `feedback_local_board_bypasses_review_gate`

---

## Risk Assessment

**Medium.** Server change is gated behind a cross-fork PR so it can't ship
without Ellis review. Credential removal has a blast radius if the wrong
agent loses board access — mitigated by staged one-agent-at-a-time removal
with heartbeat verification between each step.

Reversibility: Server gate can be reverted via another PR. Credential
removal can be reversed manually in Infisical.
