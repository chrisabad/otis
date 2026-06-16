---
name: routine-audit
description: "Audit Paperclip routines (cron-scheduled remote agents) across companies for code-vs-inference fit, agent assignment, instruction quality, cost, and reliability. Use when reviewing existing routines, creating a new one, or sweeping for drift across companies."
version: 1.0.0
audience: shared
---
# SKILL: routine-audit
**Trigger:** Auditing routines for any Paperclip company, or when creating/modifying a routine.

## Purpose

Ensure all Paperclip routines follow best practices for assignment, instruction quality, cost efficiency, and reliability. Prevents drift across companies.

## Audit Checklist (per routine)

For each routine, assess these five dimensions:

### 1. Code vs. Inference
Does this task require LLM judgment, or is it deterministic logic?

| Pattern | Use Script | Use Inference |
|---------|-----------|---------------|
| HTTP health check (curl + status code) | Yes | No |
| File cleanup (find + rm by age/size) | Yes | No |
| Git status / diff checks | Yes | No |
| API query + threshold comparison | Yes | No |
| Classify/triage errors by type | No | Yes |
| Synthesize multiple data sources | No | Yes |
| Evaluate quality or drift | No | Yes |
| Research external sources | No | Yes |

**Rule:** If the task can be expressed as a shell one-liner or simple script with no branching judgment, it should NOT be a Paperclip routine. Use a launchd plist or shell cron instead.

### 2. Agent Assignment
Is the routine assigned to the right agent based on role?

| Role | Should Handle | Should NOT Handle |
|------|--------------|-------------------|
| CEO/Orchestrator (Juno) | Strategic decisions, escalation routing, approval gating | QA checks, file cleanup, monitoring, data entry |
| Implementer (Axel) | Code changes, script execution, infrastructure fixes | Quality audits, strategic planning |
| QA/Reviewer (Quinn) | Verification, quality audits, improvement validation | Implementation, cleanup, monitoring |
| Ops/Monitor (Orion) | Health checks, incident response, system monitoring | Strategic decisions, QA reviews |
| Supervisor | Independent behavioral audits, rubric evaluation | Implementation, monitoring |

**Rule:** Match the routine to the agent whose SOUL.md role most closely aligns with the task. A CEO should not be running `find -delete`. A QA agent should not be implementing features.

**Staffing gaps:** If no existing agent fits a routine's workload, don't force it onto the wrong role. Flag it as a hiring need. The CEO agent should evaluate the roster and use the agent-onboarding skill (skills/agent-onboarding/) to hire a new agent with the right role. Better to hire than to misassign.

### 3. Instruction Quality
Score each routine's instructions against these criteria:

- [ ] **Specific inputs**: Names the exact files, APIs, or data sources to read
- [ ] **Clear logic**: Describes the decision tree or evaluation criteria
- [ ] **Defined outputs**: Specifies what to write, where, and in what format
- [ ] **Skill references**: Points to relevant SKILL.md, SOUL.md rubrics, or workspace files by path
- [ ] **Escalation path**: Defines when and how to file issues or alert humans
- [ ] **Boundaries**: States what the agent can auto-implement vs. what needs approval
- [ ] **Silent-if-healthy**: Avoids generating noise when nothing is wrong
- [ ] **Issue dedup**: If the routine can file new issues, does it check for existing open issues before `POST /api/companies/{id}/issues`? If not, flag as dedup risk.

**Rule:** If you can't tell exactly what the agent will do by reading the instructions, they need rewriting. Vague instructions like "review logs and fix issues" produce unreliable results.

### 4. Deduplication
Check for overlap with:
- Other Paperclip routines in the same or other companies
- launchd services (`launchctl list | grep hermes`)
- Hermes cron jobs (`hermes cron list`)
- Shell scripts that already exist in the workspace

**Rule:** One system of record per task. If a launchd service already does the health check, don't also have a Paperclip routine doing the same check.

### 5. Reliability
Check the routine's execution history:
- Has it ever successfully fired on schedule (vs. only manual runs)?
- What's the failure rate?
- Are linked issues completing or piling up in todo/cancelled?
- Is the concurrency policy appropriate? (coalesce_if_active is default and usually correct)

**Rule:** A routine that has never successfully run is worse than no routine — it creates a false sense of coverage.

## Audit Output Format

For each routine, produce:

```
### [Routine Name]
- Agent: [current] → [recommended if change needed]
- Type: inference / script / hybrid
- Instruction Score: [X/7] (checklist above)
- Dedup Risk: none / overlaps with [service]
- Reliability: working / failing / never-ran
- Verdict: OK / MINOR FIXES / REWRITE / CONVERT TO SCRIPT / REASSIGN / ARCHIVE
- Priority: critical / high / medium / low
- Details: [1-2 sentences on what specifically needs to change]
```

## Cross-Business Audit

When auditing across multiple companies, also check:
- Are similar routines implemented consistently? (e.g., health checks should follow the same pattern everywhere)
- Are agent assignments consistent with the company's routing-rules.json?
- Are there company-specific routines that should be generalized?

## Common Antipatterns

### Stranded Assigned Issue Loop (email triage specifically)

**Pattern:** A routine runs hourly, reads an inbox, creates Paperclip issues for "attention flag" items, and those issues get stuck as `blocked` with `activeRecoveryAction.kind = "stranded_assigned_issue"`. The assigned agent can't act on "Chris needs to read this" — it's not executable work. The routine runs again next hour and creates more.

**Fix:** Routines should only create Paperclip issues for agent-actionable work (draft reply, schedule meeting, config change). For "needs human attention," use existing signaling channels (starred inbox, notification service) instead of filing issues. See email-triage skill Rule 3 for the distinction.

### General Issue-Filing Loops

Any routine that creates issues as its primary output must have a dedup check AND a clear "when to stop" condition. If the routine's issues are piling up in `todo` or `blocked` without being resolved, the routine is generating noise, not value — it should be redesigned or paused until downstream capacity exists.

---

## When Creating New Routines

Before creating a routine, verify:
1. No existing launchd service, cron, or routine already covers this
2. The task genuinely requires inference (not scriptable)
3. Instructions meet all 7 quality criteria above
4. The assigned agent matches the task's nature per the role table
5. The routine has been tested with at least one manual run before enabling the schedule
