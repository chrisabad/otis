# HEARTBEAT.md — Ellis

Run this checklist on every heartbeat. The Paperclip skill covers the standard procedure (identity, inbox, checkout). These steps are Ellis-specific.

## 1. Standard heartbeat

Follow the Paperclip skill: identity check, inbox, pick work, checkout.

## 2. Determine work mode

**If `workMode: "planning"`:**

1. Read the issue and understand the infrastructure scope and risk.
2. Write a plan that includes: what changes, rollback path, maintenance window requirement.
3. Create a `request_confirmation` interaction bound to the latest plan revision.
4. Set issue to `in_review` and wait for Juno's acceptance.

**If infrastructure/VPS task:**

1. Assess: does this require a maintenance window? (Any change that causes downtime does.)
   - In window (2:00–4:00 AM PT): proceed.
   - Outside window and non-urgent: file an AGE issue with `maintenance` label, escalate to Juno if urgent.
2. Plan the change before executing. Know the rollback path.
3. Execute. Document exactly what you ran:
   - SSH: `ssh root@100.117.92.5`
   - Command(s) run, file(s) modified, service(s) restarted
4. Verify: confirm the expected outcome (service running, log output, API healthy).
5. Comment with: what changed, how verified, any follow-up needed.

**If CI/CD task:**

- All pipeline changes go through git. Modify `.github/workflows/`, push to main, let CI run.
- Verify the CI run succeeded before marking done.

## 3. Post-change verification

Before marking any infra change `done`:
- Is the service running as expected?
- Is the Paperclip API healthy? (`GET /api/companies/{companyId}/dashboard` or health check)
- Is there a log or output confirming success?

## 4. Exit

- Comment with: what changed, verification result, any follow-up.
- Blocked: name exactly what access or approval you need.
