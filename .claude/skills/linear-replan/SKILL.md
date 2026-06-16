---
name: linear-replan
description: Cascade a schedule change through a Linear project when one task's due date shifts. Use when Chris mentions a deliverable is delayed or moved, a contractor gives a new estimate, a date is updated mid-project, or you need to replan a project based on new information. Handles both party-mode/single-player parallel tracks and single-track projects. Posts a project update with rationale after all dates are updated.
version: 1.0.0
audience: shared
agents: [otis]
---
# Linear Replan

When a task's due date changes, cascade the shift through all downstream tasks and post a project update.

## Workflow

### 1. Identify the anchor shift
Determine:
- **Anchor task** — the task whose date changed (from conversation, Granola transcript, or explicit input)
- **Delta** — how many days it shifted (new date minus original date)
- **Reason** — why it changed (needed for the project update)

If the anchor task's date is already updated in Linear (e.g., Chris updated it on a call), query the issue to confirm the new date, then calculate delta vs. the previous date from context.

### 2. Query the full project
```graphql
{ project(id: "<project_id>") {
    name targetDate
    issues(first: 100) { nodes {
      id identifier title
      state { name }
      dueDate
      assignee { name }
    }}
}}
```

### 3. Determine which tasks to update
**Skip:**
- State is Done or Canceled
- No dueDate set
- Tasks that clearly run in parallel and don't depend on the shifted anchor (e.g., UI animatic already in flight)

**Update:** All downstream tasks with a dueDate that falls after the original anchor date. Apply the same delta to each.

**Rule of thumb:** If you're unsure whether a task depends on the anchor, shift it. It's safer to over-shift than to leave a downstream task with an impossible start date.

### 4. Apply the cascade
Update each issue's dueDate via mutation:
```graphql
mutation { issueUpdate(id: "<id>", input: { dueDate: "<new-date>" }) { success } }
```

If the last task's new date pushes past the project's `targetDate`, update the project too:
```graphql
mutation { projectUpdate(id: "<project_id>", input: { targetDate: "<new-date>" }) { success } }
```

### 5. Post a project update
Use `projectUpdateCreate` with a structured summary. See `references/project-update-template.md` for the format.

**Keep it short.** The update is surfaced in Slack — wall-of-text is noise. Aim for 8–12 lines total. Include:
- 1–2 sentences: what triggered the change and why
- Net shift (e.g., "+7 days across remaining milestones")
- 4–6 bullet highlights: only the most impactful task changes
- Milestone and project target date changes (if any)

Do NOT list every individual task update. Milestone-level summary is sufficient unless a specific task is the primary driver.

---

## Linear API
- **Endpoint:** `https://api.linear.app/graphql`
- **Auth:** `Authorization: <LINEAR_VOLLEY_API_KEY>` (DS team) or `<LINEAR_API_KEY>` (KAL team)
- **Use Python + urllib** for mutations with multi-line body strings (avoids shell escaping issues with GraphQL)

See `references/graphql-patterns.md` for copy-paste mutation patterns.
