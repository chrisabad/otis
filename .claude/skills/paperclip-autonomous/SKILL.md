---
name: paperclip-autonomous
description: >
  Fleet-wide autonomous agent workflow rules for Paperclip. Covers file-and-yield,
  queue sweep, QA protocols, drain loop prevention, issue scoping, proof-of-work,
  approvals workflow, reviewer protocol, and briefing format. Load alongside the
  paperclip skill for any agent doing autonomous issue lifecycle work.
version: 1.0.0
audience: shared
---

# Paperclip Autonomous Agent Workflow Rules

This skill covers fleet-wide coordination patterns that go beyond the base
Paperclip API skill. It assumes you have already loaded `skills/paperclip`.

---

## Queue Workflow Protocol (Non-negotiable — governs ALL agent-initiated work)

### The File-and-Yield Rule

**When an agent proactively identifies work and creates a Paperclip issue, it MUST NOT begin that work in the same session.**

Steps:
1. Identify work → check for duplicates (see Duplicate Prevention below)
2. Create the issue with full context, acceptance criteria, and priority set
3. **Stop. Yield.** Do not begin executing the task.
4. Work begins only when the issue is explicitly assigned (or re-assigned) to you via Paperclip — either by the queue sweep, a board member, or another agent routing it to you

**Exception:** Work an agent was explicitly asked to do in the current session by a board user or orchestrator can go direct (create the issue for tracking, then proceed). The file-and-yield rule applies to *proactive/background work* the agent identified on its own.

### Priority Gate (mandatory before filing)

Every issue filed **must** have a `priority` set before the agent yields. An issue with no priority cannot be sorted in the queue and will be treated as `low` by default.

| Priority | When to use |
|----------|-------------|
| `critical` | Blocks a live system or active deliverable; needs same-day attention |
| `high` | Important work, next 1–2 days; deadline or dependency at risk |
| `medium` | Standard work, no immediate deadline pressure |
| `low` | Nice-to-have, cleanup, optimization, no deadline |

### PRD Requirement for Large Issues

For any issue estimated to take **more than 15 minutes of agent execution time** (coding, research, multi-file edits, sub-agent orchestration), the filing agent must:

1. Write a PRD file at `memory/prds/YYYY-MM-DD-{task-slug}.md` with:
   - Objective (1–2 sentences)
   - Inputs / Outputs
   - Constraints
   - Success Criteria (these become acceptance criteria on the issue)
   - Current State / prior art
2. Paste the PRD path as a link in the issue description under a `## PRD` section
3. If the issue is a Large config change (>2 files, cross-agent impact): also follow the peer review protocol in AGENTS.md before starting

For small issues (<15 min, single-purpose, clear scope), a PRD is optional but the description must still meet the quality gate (Objective + Scope + Acceptance Criteria).

### Queue Sweep (Orchestrator — every heartbeat)

The orchestrator owns the queue sweep. At every heartbeat:

**Phase 1 — Backlog Triage (run first)**

1. Fetch all `backlog` issues across all active companies
2. For each backlog issue, evaluate:
   - **Promote to `todo`** if: description is complete (Objective + Scope + AC), no explicit blocker stated in description or comments, and assignee agent is available
   - **Cancel** if: stale (no updates in 14+ days AND low/medium priority), OR the description/title is clearly superseded by a newer issue, OR the issue has no description and no meaningful title
   - **Leave in backlog** if: explicitly blocked on an external dependency, or a known future item with a reason to defer
3. For any issue moved to `cancelled`: POST a comment explaining the reason before patching status

**Phase 2 — Assignment sweep**

1. Fetch all `todo` unassigned issues across all active companies (backlog items just promoted are now included)
2. Sort by priority (`critical` → `high` → `medium` → `low`), then by `createdAt`
3. Pick the top 1–3 unblocked issues
4. Self-assign (or assign to the correct specialist agent) and move to `in_progress`
5. Post a comment on each picked-up issue: what the agent will do and by when

Agents do not need to monitor the queue or ping the orchestrator — the sweep will pick up filed issues automatically within one heartbeat cycle.

---

## QA Workflow — Implementation Agents (Non-negotiable)

These rules apply to **all implementation agents**:

### 1. Acceptance Criteria Required on New Tickets

Any issue you create **must** include machine-verifiable Acceptance Criteria in the description:

```
## Acceptance Criteria
- [ ] [Testable condition — file exists, command output matches, count equals N]
```

Issues without AC will be rejected by the QA agent and moved back to `backlog`.

### 2. Proof of Work Before Leaving `in_progress`

Before transitioning an issue out of `in_progress`, you **must** post a comment with:
- **Files changed**: exact paths of every file modified or created
- **Verification command**: a single command anyone can run to verify the change
- **Output**: what the command should produce

Example:

```
**Proof of Work — ISSUE-XXX**
- Files: `skills/paperclip-autonomous/SKILL.md`
- Verify: `grep -c "in_review" skills/paperclip-autonomous/SKILL.md`
- Expected output: `3` (or more)
```

### 3. No Self-Closing — Transition to `in_review`, Not `done`

**Implementation agents CANNOT mark tickets `done` directly.** After posting Proof of Work, transition to `in_review`:

```bash
curl -s -X PATCH "$PAPERCLIP_API_URL/api/issues/[ISSUE-ID]" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $PAPER...EY" \
  -H "X-Paperclip-Run-Id: $PAPERCLIP_RUN_ID" \
  -d '{"status": "in_review"}'
```

The QA agent will read your Proof of Work comment, run the verification command, and either:
- **Mark `done`** — verification passed
- **Push back to `in_progress`** — with a comment explaining what failed

**Exception**: Issues that are purely informational, planning, or documentation-only (no code/config changes) may be marked `done` directly by the filing agent.

---

## Drain Loop Prevention (Non-negotiable — read before any `issue_commented` wake)

When you wake with `PAPERCLIP_WAKE_REASON=issue_commented`, the triggering comment may have been posted **by you** in a previous run. If you post a new comment in response, Paperclip fires another `issue_commented` event, which wakes you again — creating an infinite drain loop.

**Before posting any comment on an `issue_commented` wake, you MUST check:**

1. Fetch the comment that woke you
2. Check if the `authorAgentId` of that comment matches your own agent ID
3. If it was YOU → **do NOT post another comment**. You caused the wake. Exit silently.
4. If it was someone else → proceed normally.

**For blocked issues specifically:** If the issue status is `blocked` and the last several comments all say the same thing (drain loop artifact), do NOT add another identical comment. Acknowledge the state internally and exit. Only post if you have new information or a resolution.

---

## Anti-Confabulation Rule (Non-negotiable — applies to ALL agent communications)

A **confabulation** is stating an error, failure, or status that did not actually happen. Agents MUST NOT fabricate error claims, HTTP status codes, command outputs, or any diagnostic information they did not directly observe.

### Rules

1. **Quote real output only.** Every error, failure, or diagnostic claim in a comment or status update MUST include the actual HTTP status code, command exit code, or stderr output that was observed. Syntax:
   ```
   Status: <code> – <real error message or output snippet>
   ```
   Examples of compliant claims:
   - `Status: 404 – {"message":"Not found"}` (from a real curl response)
   - `Status: 1 – grep: /path/file: No such file or directory` (from real stderr)
   - `Status: 000 – curl: (7) Failed to connect to host` (connection refused, real output)

   Examples of NON-compliant (fabricated) claims:
   - `Got a 401 error` (no actual HTTP response was received, or the real code was different)
   - `Permission denied` (without quoting the real command output)
   - `The API returned ***` (masking is fine; inventing a status code is not)

2. **No invented status codes.** If a curl or API call did not execute (e.g., network timeout, DNS failure, command not found), report what actually happened — not a plausible-looking HTTP code. If curl didn't get a response, the status code is `000` or the exit code is non-zero with an error message. Report that, not `401` or `403`.

3. **No speculative diagnoses.** "The server is down" is speculation. "I received `Status: 000 – curl: (7) Failed to connect`" is a fact. Report facts; let the reader diagnose.

4. **Fail open, then report factually.** If a tool call fails silently (returns no output or an unclear error), say so: "Tool returned empty output with exit code N." Do NOT fill in what you think the error should have been.

5. **Mask real secrets, not real errors.** When quoting output that contains API keys, tokens, or credentials, replace the secret value with `[REDACTED]`. Do NOT redact or alter the status code, error message, or diagnostic content — those are essential for debugging.

### Enforcement

Any comment or status update that claims a failure (401, 403, 500, permission denied, etc.) without quoting the real observed output will be treated as a **phantom completion** violation. The QA reviewer will push the issue back with `REJECTED: no real error evidence — confabulation suspected`.

---

## Issue Scoping Requirements for Autonomous Execution

**For any issue intended for autonomous agent execution, the description MUST include all five fields below.** Issues missing any required field will be pushed back to `backlog` by the QA agent.

### Required Fields

| # | Field | Why it matters |
|---|-------|---------------|
| 1 | **Exact file paths** | Agents cannot guess which file to edit. "Update the config" is not actionable. |
| 2 | **Grep pattern or line range** | Pinpoints the change site. Without it, agents may edit the wrong block. |
| 3 | **Before/after example** | Required for non-obvious changes. Eliminates ambiguity about intent. |
| 4 | **Verification command** | A deterministic shell command that returns pass/fail. The QA agent runs it exactly as written. |
| 5 | **Out of scope** | Prevents scope creep. An explicit boundary contains the work. |

### Scoping Template

Every implementation issue description must follow this structure:

```
## Objective
[1-2 sentences: what this achieves and why it matters now]

## Scope
- **File(s):** `/exact/path/to/file.ext` — what to change and where
- **Locate with:** `grep -n 'pattern' /exact/path/to/file.ext`  (or: lines N–M)
- **Change:** Before state → after state (show the diff for non-obvious changes)
- **Out of scope:** [What this issue explicitly does NOT cover]

## Acceptance Criteria
- [ ] `[shell command that QA can run]` → [expected output or exit code]
- [ ] `[shell command that QA can run]` → [expected output or exit code]
```

### Enforcement

**QA agent:** Checks all `in_review` issues for these five fields before verifying. Issues that lack exact file paths or a runnable verification command are pushed back to `in_progress` with a `REJECTED` comment listing which fields are missing.

**Orchestrator:** Will not promote `backlog` issues to `todo` if description is under 200 characters or lacks an `## Acceptance Criteria` section.

**Agents filing issues:** Before submitting, ask: can another agent pick this up cold and know exactly which file to open, what line to find, what to change, and how to verify it? If no — the issue is not ready.

---

### Duplicate Prevention

Before creating an issue, check existing issues in the same company. If an issue with a substantially similar title or scope already exists (any status except `done`/`cancelled`), **do not create a duplicate**. Instead, comment on or update the existing issue.

---

## Creating Issues

### Quality Gate — What Makes a Good Issue

**A good description answers three questions:**
1. **What?** — What specific work needs to happen (not just "fix it" or "clean up")
2. **Where?** — Which files, systems, APIs, or repos are involved
3. **How do we know it's done?** — Testable acceptance criteria (file exists, test passes, count matches, etc.)

**❌ Bad example:**
```
Title: "Context Unification"
Description: "Extract raw bash logging and API curls into python scripts and SKILL.md. Clean up 21 agent files."
```
Why it's bad: No specific files listed, "clean up" is vague, no acceptance criteria, no scope boundaries.

**✅ Good example:**
```
Title: "[Agent] Context File Cleanup — Extract Inline Scripts to tools/ and Skills"
Description:
## Objective
Refactor all agent context files to remove inline bash/curl blocks
and replace them with references to shared tools and skills.

## Scope
- Audit all files in target directory (currently ~10 active context files)
- For each file, identify inline bash/curl blocks
- Create or extend Python wrappers in tools/ that replace those blocks
- Update context files to reference the wrapper scripts

## Acceptance Criteria
- [ ] No context file contains raw curl commands or multi-line bash blocks
- [ ] All extracted logic lives in tools/ as Python scripts with clear CLI interfaces
- [ ] All existing Paperclip API interactions still work end-to-end
- [ ] PR or commit with before/after diff showing the cleanup
```

### Project Assignment

When filing issues, agents should set `projectId` to link the issue to the appropriate project. This is required for scoped efforts and enables project-level velocity tracking.

**Rules:**

| Issue type | `projectId` required? |
|------------|----------------------|
| PRD-backed issues (any issue with a `## PRD` section or parent PRD) | **Required** |
| Taskmaster / multi-step breakdowns (subtasks of a larger effort) | **Required** |
| Freestanding tactical issues (single action, no parent PRD, no multi-step context) | Optional |

If no matching project exists and the issue is part of a significant scoped effort, create the project first, then file the issues against it. If unsure which project applies, leave `projectId` unset for freestanding tactical issues and let the orchestrator assign during queue sweep.

---

## Filtering Out Noise

Paperclip auto-generates **productivity review** issues (`originKind: "issue_productivity_review"`) when agents have long no-comment streaks. These are system hygiene items, not real work. When presenting a backlog overview to a human, always filter these out to show substantive issues only.

---

## Priority Sorting for Human Briefings

When surfacing issues to a board user, sort by:
1. **Deadline-driven** (legal filings, compliance, time-sensitive actions) — always first
2. **Pending approvals** (board decisions only the human can make) — next
3. **Service outages** (agents in error, broken crons) — next
4. **Blocked issues needing human decisions** — next
5. **Pattern problems** (e.g. routine producing blocked issues hourly) — next, explain the pattern briefly
6. **Backlog for awareness** — last, brief summary only

**Briefing format for "what should I prioritize" catch-ups:**
```
🔴 HIGH PRIORITY
1. ISSUE-2141 — [LEGAL] State Filing Due May 17
   → [link]
   → One-line what the human needs to do

🔄 PATTERN ISSUE
7 email triage issues stuck in blocked loop (ISSUE-2155–2163)
   → Root cause: routine runs hourly → creates blocked issues → nothing drains them
   → Fix: clear stale triage issues or pause routine

📋 NEEDS YOUR INPUT
3. ISSUE-2139 — Re-authenticate account
4. ISSUE-2103 — Install GitHub App (needs org admin)
```

Key rules:
- One-line what the human needs to DO, not just what the issue is about
- Group similar issues (e.g. 7 triage issues) as a pattern, don't list each individually
- End with a concrete ask: "which of these should I handle first?"

---

## Issues API — Critical Pitfalls

### Correct endpoints

The comment endpoint is `/api/issues/[id]/comments` — **NOT** `/api/companies/[id]/issues/[id]/comments` (returns 404).

**Issue creation endpoint:** `POST /api/companies/[COMPANY-ID]/issues` — **NOT** `POST /api/issues` (returns "API route not found"). Always include the company ID in the path.

### Comment field name

The field name is `body` (string), NOT `content`. Using `content` returns a validation error: `Expected string, received undefined`. Using `{"body": {...object...}}` also fails — it must be a plain string.

---

## Approvals API

When an agent needs explicit board approval before proceeding with a task, use the Approvals API per the base paperclip skill's "Requesting Board Approval" section. **Do NOT ask for approval in chat threads** — use Paperclip approvals as the system of record.

### Approval Types

| Type | When to use |
|------|-------------|
| `approve_ceo_strategy` | Agent needs sign-off on a strategy, direction, or decision before proceeding |
| `hire_agent` | Requesting approval to onboard a new agent |
| `budget_override_required` | Spending or budget decision that exceeds normal thresholds |

### Payload Template (mandatory)

Every approval payload **must** use this structure. The board reviews approvals in the UI where the payload renders directly — a lazy or vague payload wastes the reviewer's time and will be rejected.

```json
{
  "summary": "One-line plain-English title of what needs approval",
  "context": "2-3 sentences of background: what work has been done, what state things are in, and why this is at the approval stage now",
  "currentStatus": "Where things stand right now — what's complete, what's pending",
  "whatApprovalUnlocks": "Specifically what happens next if approved — be concrete",
  "risk": "Low/Medium/High — brief explanation of downside risk and reversibility",
  "recommendation": "Approve/Reject/Revise — with a brief rationale"
}
```

**Rules:**
- Write for a busy executive scanning a queue. Every field should be immediately useful.
- `whatApprovalUnlocks` is the most important field — the reviewer needs to know what they're saying yes to.
- Never use placeholder text like "needs review" or "legacy ticket". Write real context.
- If you don't have enough context to write a meaningful payload, read the issue comments and history first. If still unclear, use `recommendation: "Revise — insufficient context to recommend"` and explain what's missing.

### Post-Approval Actions (mandatory)

After creating an approval, the agent **must**:

1. **Post a readable comment** on the approval. The UI renders payloads as raw JSON — the comment is what the reviewer actually reads.

```
## [ISSUE-ID]: [Brief title]

**What this is:** [2-3 sentences of context]

**What you need to do:** [Specific action the reviewer should take]

**Risk:** [Low/Medium/High — brief explanation]

**Recommendation:** [Approve/Reject/Revise — with rationale]
```

**Endpoint:** `POST /api/approvals/[APPROVAL-ID]/comments` with `{"body": "..."}`

This is non-negotiable. An approval without a readable comment is incomplete.

---

## QA Reviewer Agent Protocol

This section applies to any agent assigned the **reviewer** role in a Paperclip execution policy (i.e., any agent that handles `in_review` issues as part of a multi-stage workflow). Read and follow this every time you pick up an `in_review` issue.

### Overview

When an issue enters `in_review`, Paperclip's execution policy routes it to you for verification. Your job is to verify the work, record a verdict, and close the loop — **in that order, without interruption**. Incomplete runs (verdict posted but status not updated, or vice versa) strand the issue and trigger expensive recovery cycles.

The plugin has a "Reviewer Close Recovery" (RCR) sweep that can rescue stranded verdicts, but it adds latency. Don't rely on it. Complete the full close sequence in every run.

### The Review Close Sequence (do all three steps before touching any other issue)

**Step A — Verify the work**
1. `GET /api/issues/{id}` and `GET /api/issues/{id}/comments` — find the Proof of Work (PoW) comment from the implementer
2. PoW must contain: what was done, commands run (with output), and how to verify
3. Run the verification commands. For PR-bearing issues: `gh pr diff <N> --repo <owner/repo>` and `gh pr checks <N>`
4. Form your verdict: **PASSED**, **FAILED**, or **REJECTED** (no PoW)

**Step B — Post your verdict comment**

Post a comment whose body contains exactly one of: `PASSED`, `FAILED`, or `REJECTED`. The plugin scans comments for these keywords to detect and recover stranded verdicts — if your comment doesn't contain one of these exact words, recovery is blind.

```bash
curl -X POST "$PAPERCLIP_API_URL/api/issues/{id}/comments" \
  -H "Authorization: Bearer $PAPER...EY" \
  -H "Content-Type: application/json" \
  -d '{"body": "PASSED. <evidence and narrative here>"}'
```

For non-PR issues, include: what you verified, commands run with exit codes, and your judgment (≥50 chars).
For PR-bearing issues, also include: line count reviewed (`gh pr diff <N> | wc -l`), CI state, and any filesystem checks.

**Step C — Merge the PR (if the issue references a PR and verdict is PASSED)**

**This step MUST happen before Step D (PATCH status).** This is a hard gate — an issue must not reach `done` while its linked PR is still open.

1. Check if the issue references a PR (look for PR URLs in the issue body, comments, or work products).
2. If a PR exists and your verdict is PASSED:
   ```bash
   # Merge the PR
   gh pr merge <N> --repo <owner/repo> --squash --delete-branch
   ```
3. Verify the merge succeeded:
   ```bash
   gh pr view <N> --repo <owner/repo> --json state,mergedAt
   # state must be "MERGED", mergedAt must be non-null
   ```
4. If the merge fails (conflicts, CI failures, branch protection rules):
   - Do NOT proceed to Step D.
   - Post a FAILED verdict instead and explain the merge failure in your comment.
   - PATCH status to `in_progress` with a comment explaining why the merge failed.

**Step D — PATCH status immediately after merging**

Do this **before** moving to any other issue. This is the step most commonly skipped, causing stranded issues.

| Verdict | PR merge status | Status to set |
|---------|----------------|---------------|
| PASSED | Merged (or no PR) | `done` |
| PASSED | Merge failed | `in_progress` (explain failure) |
| FAILED | N/A | `in_progress` |
| REJECTED (no PoW) | N/A | `in_progress` |

```bash
# Example — passing review (PR merged or no PR)
curl -X PATCH "$PAPERCLIP_API_URL/api/issues/{id}" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY" \
  -H "Content-Type: application/json" \
  -H "X-Paperclip-Run-Id: $PAPERCLIP_RUN_ID" \
  -d '{"status": "done"}'
```

⚠️ **Always include `Authorization: Bearer` on this PATCH.** Omitting the header falls through to board-user (admin) auth, which bypasses the execution policy review gate and creates a silent accounting failure.

**Step E — PR approval (if the issue references a PR)**

After merging and the Paperclip PATCH, submit GitHub review approval (the PR is already merged, but this records the formal review on GitHub):
```bash
gh pr review <N> --approve --repo <owner/repo>
```
Order matters: merge first (Step C), then Paperclip PATCH (Step D), then GitHub review approval (Step E).

### Common failure modes

| What goes wrong | Why it hurts | How to prevent it |
|---|---|---|
| Posted verdict comment, forgot to PATCH status | Issue stranded in `in_review`; recovery fires and wakes orchestrator | Complete Step C before leaving the issue |
| Omitted `Authorization` header on PATCH | Review gate silently bypassed | Always include the header; never omit it |
| Moved to a second issue before closing the first | First issue left without a status update | Finish the full close sequence on one issue before starting another |
| Verdict comment doesn't contain PASS/FAIL/REJECTED | RCR sweep can't detect stranded verdict | Use the exact keywords — no paraphrasing |
| Approved without merging the linked PR | Issue reaches `done` while PR stays open (phantom completion) | Always merge the PR (Step C) before PATCHing status to `done` (Step D) — merge-before-verdict is a hard gate |

### Finding your assigned in_review issues

```bash
GET /api/companies/$PAPERCLIP_COMPANY_ID/issues?assigneeAgentId=$PAPERCLIP_AGENT_ID&status=in_review
```

If `$PAPERCLIP_TASK_ID` is set in your environment, prioritize that issue first.