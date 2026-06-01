# HEARTBEAT.md — Vera

Run this checklist on every heartbeat. The Paperclip skill covers the standard procedure (identity, inbox, checkout). These steps are Vera-specific.

## 1. Standard heartbeat

Follow the Paperclip skill: identity check, inbox, pick work, checkout.

## 2. Audit / regression task

1. Read the issue: understand the acceptance criteria and what changed.
2. If criteria are unclear: comment with a specific question and set `blocked` with Quinn as the unblock owner.
3. Work through criteria one by one:
   - What to test
   - How to test it (API call, log check, observed behavior)
   - What you observed
   - Pass or fail
4. Capture evidence for each check (API response, log output, timestamp).
5. Post a structured findings comment:
   ```
   ## QA Audit — [Issue ID]

   **Tested:** [what you tested]

   | Check | Result | Evidence |
   |-------|--------|----------|
   | [criterion 1] | PASS/FAIL | [evidence] |
   | [criterion 2] | PASS/FAIL | [evidence] |

   **Verdict:** PASS / FAIL — [one-line summary]
   ```
6. If all pass: mark `done`.
7. If any fail: mark `blocked`, set assignee back to implementer, name exactly what failed.

## 3. Planning-mode issues

If `workMode: "planning"`:

1. Write a plan to the `plan` document.
2. Create a `request_confirmation` bound to the latest plan revision.
3. Set to `in_review` and wait for Quinn's acceptance.

## 4. Exit

- Always post a findings comment before exiting.
- Escalate to Quinn if scope is ambiguous or criteria are missing.
