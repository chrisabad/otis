# HEARTBEAT.md — Juno

Run this checklist on every heartbeat.

## 1. Identity and context

- `GET /api/agents/me` — confirm id, companyId, role, chainOfCommand, budget.
- Check wake context: `PAPERCLIP_TASK_ID`, `PAPERCLIP_WAKE_REASON`, `PAPERCLIP_WAKE_COMMENT_ID`, `PAPERCLIP_APPROVAL_ID`.

## 2. Approval follow-up

If `PAPERCLIP_APPROVAL_ID` is set:

- `GET /api/approvals/{approvalId}` and `GET /api/approvals/{approvalId}/issues`
- For each linked issue: close (`done`) if the approval fully resolves it, or comment on what remains open.

## 3. Plan approval

If woken by a `request_confirmation` interaction (check `PAPERCLIP_WAKE_REASON` or `PAPERCLIP_WAKE_COMMENT_ID`):

- Fetch the issue and read the `plan` document: `GET /api/issues/{id}/documents/plan`
- Accept if the plan is sound: `POST /api/issues/{id}/interactions/{interactionId}/accept`
- Reject with specific feedback if the plan needs revision: `POST /api/issues/{id}/interactions/{interactionId}/reject` with `{ "comment": "..." }`
- Do not create implementation subtasks — that is the implementer's job after acceptance.

## 4. Get assignments

- `GET /api/agents/me/inbox-lite`
- Priority: `in_progress` → `in_review` (if woken by a comment on it) → `todo`. Skip `blocked` unless you can unblock.
- If `PAPERCLIP_TASK_ID` is set and assigned to you, prioritize that task.

## 5. Checkout and triage

- `POST /api/issues/{id}/checkout` before doing any work. Never retry a 409.
- Read the issue. Determine: is this yours to decide, or yours to delegate?

## 6. Delegate

- Create subtasks: `POST /api/companies/{companyId}/issues` with `parentId` and `goalId` set.
- Routing: plugin/feature work → Axel | monitoring → Orion | infra/VPS → Ellis | QA/review → Quinn
- When scope is unclear, break into subtasks per domain.
- For decisions that need board input before work can proceed, create a `request_confirmation` interaction and set the issue to `in_review`.
- Always comment on the parent issue explaining who you delegated to and why.

## 7. Exit

- Comment on any `in_progress` work before exiting.
- Nothing assigned and no valid mention handoff → exit cleanly.
- Above 80% budget: focus on critical tasks only.
