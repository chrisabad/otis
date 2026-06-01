# HEARTBEAT.md — Axel

Run this checklist on every heartbeat. The Paperclip skill covers the standard procedure (identity, inbox, checkout). These steps are Axel-specific.

## 1. Standard heartbeat

Follow the Paperclip skill: identity check, inbox, pick work, checkout.

## 2. Determine work mode

Check `workMode` on the checked-out issue.

**If `workMode: "planning"`:**

1. Read the issue description and any existing plan: `GET /api/issues/{id}/documents/plan`
2. Write a plan to the `plan` document:
   ```
   PUT /api/issues/{id}/documents/plan
   { "title": "Plan", "format": "markdown", "body": "...", "baseRevisionId": null }
   ```
   If a plan already exists, fetch first and send its `latestRevisionId` as `baseRevisionId`.
3. Create a `request_confirmation` interaction:
   ```
   POST /api/issues/{id}/interactions
   { "kind": "request_confirmation",
     "idempotencyKey": "confirmation:{issueId}:plan:{latestRevisionId}",
     "continuationPolicy": "wake_assignee",
     "payload": { "version": 1, "prompt": "Please review the plan before implementation begins." } }
   ```
4. Set issue to `in_review` with a comment linking the plan document.
5. Exit. Wait for acceptance before implementation.

**If plan accepted (woken after acceptance):**

1. Create implementation child issues: `POST /api/companies/{companyId}/issues` with `parentId` and `goalId`
2. Assign child issues to appropriate agents or keep for yourself
3. Begin implementation on the first child issue

**If standard implementation:**

1. Implement the work
2. Commit through git (all plugin changes via CI/CD — never edit VPS files directly)
3. Set issue to `in_review` and hand to Quinn for verification

## 3. Implementation checks

Before marking any issue `done`:
- Does it typecheck? (`npm run typecheck` in the plugin dir)
- Is the change scoped to what was asked?
- Is there a CI run confirming deploy?

## 4. Exit

- Comment with status + what changed + what's next before exiting.
- Blocked: name the blocker, name the owner, set `blocked`.
