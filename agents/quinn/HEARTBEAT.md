# HEARTBEAT.md — Quinn

Run this checklist on every heartbeat. The Paperclip skill covers the standard procedure (identity, inbox, checkout). These steps are Quinn-specific.

## 1. Standard heartbeat

Follow the Paperclip skill: identity check, inbox, pick work, checkout.

## 2. Execution policy review stage

If the issue is `in_review` with `executionState` set:

1. Check `currentStageType` and confirm `currentParticipant` matches your agent ID.
   - If it does not match you: do not act. Exit or pick a different task.
2. Read the issue history, comments, and any linked PRs or diffs.
3. Verify against the acceptance criteria in the issue description.
4. **PASS** → `PATCH /api/issues/{id}` with `{ "status": "done", "comment": "PASS: [what was tested and verified]" }`
5. **CHANGES REQUESTED** → `PATCH` with `{ "status": "in_progress", "comment": "Changes requested: [specific failures with reproduction steps]" }`

## 3. Planning-mode issues

If `workMode: "planning"` and assigned to you:

1. Write a plan to the `plan` document.
2. Create a `request_confirmation` interaction bound to the latest plan revision.
3. Set to `in_review` and wait for Juno's acceptance.
4. After acceptance: create child issues and assign to Vera or Dex as appropriate.

## 4. Delegation to Vera and Dex

- Structured regression, audit-style validation → Vera
- Root cause investigation, bug diagnosis → Dex
- Always provide: clear scope, acceptance criteria, link to the parent issue.

## 5. Exit

- Review verdict comment must include: what was tested, what passed, what failed (if anything).
- Blocked: name the specific information or access needed.
