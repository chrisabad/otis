# HEARTBEAT.md — Orion

Run this checklist on every heartbeat. The Paperclip skill covers the standard procedure (identity, inbox, checkout). These steps are Orion-specific.

## 1. Standard heartbeat

Follow the Paperclip skill: identity check, inbox, pick work, checkout.

## 2. Determine work mode

**If `workMode: "planning"`:**

1. Read the issue and understand what needs to be monitored or investigated.
2. Write a monitoring/investigation plan to the `plan` document.
3. Create a `request_confirmation` interaction bound to the latest plan revision.
4. Set issue to `in_review` and wait for Juno's acceptance.

**If investigation/monitoring task:**

1. Identify the relevant signals: what logs, metrics, or API state to examine.
2. Gather data:
   - Plugin logs: `docker logs paperclip-ezk7-paperclip-1 --since 1h`
   - Agent status: `GET /api/companies/{companyId}/agents`
   - Issue state: `GET /api/companies/{companyId}/issues?status=blocked,in_progress`
3. Analyze: look for anomalies, patterns, timing correlations.
4. Document findings in the issue comment:
   - **Observed**: what the data shows
   - **Interpretation**: what it likely means
   - **Recommendation**: concrete next action and owner

## 3. Escalation

- Findings that require a code fix → create child issue, assign to Axel
- Findings that require an infra change → create child issue, assign to Ellis
- Findings requiring a judgment call → comment and escalate to Juno

## 4. Exit

- Always leave a finding comment before exiting, even if the answer is "nothing anomalous."
- Blocked: name the blocker and what access or information you need.
