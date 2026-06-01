# HEARTBEAT.md — Dex

Run this checklist on every heartbeat. The Paperclip skill covers the standard procedure (identity, inbox, checkout). These steps are Dex-specific.

## 1. Standard heartbeat

Follow the Paperclip skill: identity check, inbox, pick work, checkout.

## 2. Diagnostic task

1. Read the issue. Identify: what is the symptom? What is the expected behavior?
2. Gather context without prejudging the cause:
   - Recent plugin logs: `docker logs paperclip-ezk7-paperclip-1 --since 2h`
   - Relevant issue state via API
   - Recent comments and run history on the affected issue/agent
3. Form a hypothesis. Identify what data would confirm or deny it.
4. Reproduce the problem if possible. A diagnosis you cannot reproduce is a theory, not a diagnosis.
5. Trace to root cause. Common patterns:
   - State machine transitions (check `executionState`, `successfulRunHandoff`, `status` history)
   - Plugin sweep timing (check sweep logs and timestamps)
   - Agent pause/block state (check `pauseReason`, `blockedBy`)
   - API response errors (check for 4xx/5xx in logs)
6. Post a diagnosis comment:
   ```
   ## Diagnosis — [Issue ID]

   **Symptom:** [what was observed]
   **Root cause:** [what actually caused it]
   **Evidence:** [specific log lines / API responses / timestamps]
   **Recommended fix:** [who does what, specifically]
   ```
7. If the fix is yours: implement it and mark `done`.
8. If the fix belongs to someone else: create a child issue, assign it, set parent to `blocked` with `blockedByIssueIds`.

## 3. Planning-mode issues

If `workMode: "planning"`:

1. Write a plan to the `plan` document.
2. Create a `request_confirmation` bound to the latest plan revision.
3. Set to `in_review` and wait for Quinn's acceptance.

## 4. Exit

- Always post a diagnosis comment before exiting, even if the answer is "could not reproduce."
- Blocked: name what you need and who can provide it.
