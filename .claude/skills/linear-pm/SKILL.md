---
name: linear-pm
description: >
  Linear project management for Chris Abad's Design Studio team at Volley.
  Query projects, issues, and milestones; create art production projects from templates;
  audit contractor hours and productivity; check project health and blockers;
  create issues following Chris's naming conventions.
  Also covers Kaleidoscope agent-driven projects (KAL team) — see bottom of this file.
version: 1.0.0
audience: shared
agents: [otis]
---
# Linear Project Management – Design Studio

Manage Linear projects, issues, and milestones for Chris Abad's Design Studio team at Volley.

## API Access

- **Endpoint:** `https://api.linear.app/graphql`
- **Authentication:** Bearer token in `.env`
  - Volley DS: `LINEAR_VOLLEY_API_KEY`
  - Kaleidoscope (KAL): `LINEAR_API_KEY`
- **Header format:** `Authorization: ${LINEAR_VOLLEY_API_KEY}` (no Bearer prefix — Linear API keys are passed directly)

**Preferred method — Python urllib (Hermes sessions):**
```python
from hermes_tools import terminal
import json, urllib.request

result = terminal("echo $LINEAR_VOLLEY_API_KEY")
key = result.get("output", "").strip()

url = "https://api.linear.app/graphql"
headers = {"Authorization": key, "Content-Type": "application/json"}

def linear_query(query_str, variables=None):
    payload = {"query": query_str}
    if variables:
        payload["variables"] = variables
    req = urllib.request.Request(url, data=json.dumps(payload).encode(), headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read())
```

**Fallback — curl (only works if env var expansion is guaranteed):**
```bash
curl -s --max-time 15 -X POST https://api.linear.app/graphql \
  -H "Authorization: $LINEAR_VOLLEY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query": "{ viewer { name } }"}'
```

> **Pitfall:** Always include `--max-time 15` (or similar timeout) on Linear API curls. Without it, requests can hang indefinitely in Hermes terminal, causing silent timeouts that look like auth failures. Add `-v` for debugging, but `-s --max-time 15` should be the default.

> **Pitfall:** In Hermes sessions, `curl` with `$LINEAR_VOLLEY_API_KEY` inside single-quoted JSON bodies silently fails — the shell doesn't expand the env var, and output comes back empty string (exit code -1). Use Python `urllib.request` instead. First `terminal("echo $LINEAR_VOLLEY_API_KEY")` to extract the key, then use it in Python code directly. This pattern is reliable and returns proper JSON.

> **Pitfall:** Linear's GraphQL filter syntax is picky. `team: { id: { eq: "..." } }` is NOT valid on `ProjectFilter` — use `teamId: { eq: "..." }` instead. The `state` field on projects is a plain `String!`, not an object — don't try `{ type: { in: [...] } }` on project state. Use `project(filter: {name: {contains: "search"}})` for text search with variables.

> **Pitfall — Hermes terminal `curl` may silently return empty output:** If a `curl` command returns empty output and exit code -1, the env var may not be expanding correctly in the shell context. Switch to Python `urllib.request` with the key read from `os.environ` for reliable results in Hermes.

## Team Context

- **DS Team ID:** `cf17db93-28dc-4cef-b630-ffdf75bbf778`
- **Team name:** Design Studio (Volley)
- **Art Director:** Chris Abad
- **Design Ops:** Alyssa, Jordyn
- **Game Designers:** PJ (Jeopardy/Wheel of Fortune), Alex Gold (Wit's End)

See `references/team.md` for full roster, contractors, and budget tracking.

## Naming Conventions

### Issue Naming: `[Verb] [deliverable] – [Role]`

Format: Action-oriented, with role in brackets at the end.

**Examples:**
- `Design hero character – [Art Director]`
- `Illustrate round 1 categories – [Illustrator]`
- `Animate question reveal – [Motion Designer]`
- `Review art assets – [Art Director]`
- `Set up Photoshop templates – [Design Ops]`

**Common verbs:**
- Design, Illustrate, Animate, Model, Texture, Comp, Review, Set up, Export, Audit

**Common roles:**
- Art Director, Illustrator, Motion Designer, 3D Artist, Concept Artist, Design Ops, Game Designer

### Project Naming

- **Art Production:** `[Title] – Art Production`  
  Example: `Jeopardy S4 – Art Production`
  
- **Feature/Mode:** `[Title] - [Feature]`  
  Example: `Wit's End - Daily Challenge`
  
- **General:** `Project [Name]`  
  Example: `Project Rebrand 2025`

## Milestone Patterns

Standard art production pipeline (in sequence):

1. **Pipeline Setup** – Templates, folder structures, asset taxonomy
2. **Vertical Slice** – One complete example (e.g., one round, one question type)
3. **Mode-by-mode** – Expand to all modes/features iteratively
4. **Polish & Delivery** – Final review, optimization, handoff

Adjust per project type; see `references/workflows.md` for templates.

## Estimation & Budgeting

- **Story points:** Fibonacci scale (1, 2, 3, 5, 8, 13, 21)
  - Use for complexity/effort estimation
  - Not time-based; calibrated to hours via conversion table below

- **Hours conversion table** (calibrated from 33 DS tasks, YTD 2026):

  | Points | Typical hours | Budget @ $75/hr | Watch flag (re-scope if exceeded) |
  |---|---|---|---|
  | 1pt | 4–8h | ~$300–600 | >12h |
  | 2pt | 12–24h | ~$900–1,800 | >32h |
  | 3pt | 12–24h | ~$900–1,800 | >32h |
  | 5pt | 24–40h | ~$1,800–3,000 | >56h |
  | 8pt | 40–72h | ~$3,000–5,400 | >96h |
  | 13pt | 80–120h | ~$6,000–9,000 | >160h |
  | 21pt | 120–200h | $9,000+ | — |

- **Calibration log:** `data/budget-calibration-log.md` — 33 historical task records. Update at every project close by cross-referencing Rippling timecard export against DS tags.

- **Budget prompt template:** `tools/budget-estimate-prompt.md` — paste a project brief at the bottom. Includes calibration context from YTD data. Use this when generating any new project budget.

- **Common misscoping patterns (always rate one tier higher when any applies):**
  - "Exploration", "Concepting", "Style Study", "Research" tasks → +1 tier + 50% hour buffer
  - Wireframes for new UI systems (new game mode, character progression) → 5–8pt minimum
  - Art direction reviews spanning multiple areas → 3–5pt, not 1–2pt
  - Task description contains 3+ deliverables → split into subtasks first

- **Buffer:** Add 20–25% to all tasks rated 5pt or higher for iteration/review cycles

## Labels

**Key labels:**
- **Chris's Review Required** – Art Director sign-off needed
- **Live Review** – Schedule sync review with Chris
- **Design Lab** – Experimental/R&D work

See Linear workspace for full label taxonomy.

## Common Queries

**Common queries use DS Team ID:** `cf17db93-28dc-4cef-b630-ffdf75bbf778` (Volley).

**Frequently referenced project IDs:**
- **AYS Pre-Production:** `f375683a-eb90-433f-98b9-879db060478e`
- **Chris's Linear user ID:** `67cae322-b75e-4e24-b329-cb39d5b2acfc`

### Search projects by name

```graphql
query SearchProjects($search: String!) {
  projects(filter: { name: { contains: $search } }) {
    nodes { id name startDate targetDate description }
  }
}
```

### Get project milestones and issues

```graphql
query ProjectDetail($projectId: String!) {
  project(id: $projectId) {
    id name startDate targetDate description
    projectMilestones { nodes { id name targetDate description } }
  }
}
```

> **Pitfall — Project state field is a plain String, not an object:** Linear's `Project.state` returns a simple string like `"started"`, `"planned"`, `"backlog"`. Attempting `state { name type }` on a Project will return HTTP 400. Only `Issue.state` is an object with `{ name }`.

> **Pitfall — Hermes terminal `curl` may silently return empty output:** If a `curl` command against the Linear API returns empty output and exit code -1, the env var is likely not expanding in the shell context. Use Python `urllib.request` with the key from `os.environ.get("LINEAR_VOLLEY_API_KEY")` instead. See the example in the API Access section above.

### List active projects

```graphql
query ActiveProjects {
  projects(filter: { teamId: { eq: "cf17db93-28dc-4cef-b630-ffdf75bbf778" } }) {
    nodes { id name state startDate targetDate lead { name } progress }
  }
}
```

> **Pitfall:** The `state` field on Linear `Project` is a plain `String!` (e.g. `"started"`, `"planned"`, `"backlog"`), **not** an object with `{ name type }` subfields. Filtering by state type (e.g. `state: { type: { in: [...] } }`) will return HTTP 400. Filter client-side after fetching, or use the `ProjectFilter` `state` field which accepts a Plain String comparison. The same applies to `Issue.state` — use `state: { name: { eq: "In Progress" } } }` (not `type`).

### Get issues for a project

```graphql
query ProjectIssues($projectId: String!) {
  project(id: $projectId) {
    id name
    issues { nodes { id title state { name } assignee { name } estimate labels { nodes { name } } createdAt updatedAt } }
  }
}
```

> **Note:** `state` on `Issue` **is** an object with `{ name }` subfields (unlike `Project.state` which is a plain string).

### Find blocked issues

```graphql
query BlockedIssues {
  issues(filter: { team: { id: { eq: "cf17db93-28dc-4cef-b630-ffdf75bbf778" } }, state: { name: { eq: "Started" } } }) {
    nodes { id title assignee { name } labels { nodes { name } } }
  }
}
```

> **Pitfall:** Issue `state` uses `state: { name: { eq: "Started" } }` (object with `name`). Project `state` is a plain string (e.g. `"started"`). Don't mix them up — both will 400 if you use the wrong shape.
```

### Contractor hour audit

```graphql
query ContractorIssues($assigneeId: String!, $startDate: DateTime!) {
  issues(filter: { team: { id: { eq: "cf17db93-28dc-4cef-b630-ffdf75bbf778" } }, assignee: { id: { eq: $assigneeId } }, completedAt: { gte: $startDate } }) {
    nodes { id title estimate completedAt parent { title } project { name } }
  }
}
```

## Creating a New Art Production Project

**Project mutation:**

```graphql
mutation CreateArtProductionProject($input: ProjectCreateInput!) {
  projectCreate(input: $input) {
    project { id name url } success
  }
}
```

**Example input:**
```json
{
  "input": {
    "name": "[Game Title] – Art Production",
    "teamId": "cf17db93-28dc-4cef-b630-ffdf75bbf778",
    "leadId": "[Chris's user ID]",
    "description": "Art production pipeline. See milestones for phasing.",
    "state": "planned"
  }
}
```

**Milestone sequence:** Pipeline Setup → Vertical Slice → Mode-by-mode → Polish & Delivery

See `references/workflows.md` for full templates and issue patterns.

**AYS Production Workflow:** AYS Art Production follows Volley's 5-stage pipeline (Pipeline Setup & Asset Contract → Vertical Slice → Asset Production → Integration & Assembly → Polish & Tuning), NOT the generic 4-stage template. Key differences: Creative Developer role owns asset pipeline and R3F/Theatre.js integration, animation is multi-track (CSS/JS + Lottie + sprite sheets + optional Rive), AI Artist generates production character animations, production runs parallel with engineering. See `references/ays-context.md` for full production pipeline details, handoff artifacts, Alpha/Beta scope split, and all Notion page IDs.

## Project Health Checks

**Warning signs:**
- "Chris's Review Required" issues > 5 → Review backlog
- Blocked issues > 3 → Dependency resolution needed
- Overdue milestones → Scope/timeline discussion
- Contractor hours > 90% budget → Budget review

**Weekly health query:**

```graphql
query WeeklyHealthCheck {
  team(id: "cf17db93-28dc-4cef-b630-ffdf75bbf778") {
    issues(filter: { state: { type: { eq: "started" } } }) {
      nodes { id title assignee { name } project { name } labels { nodes { name } } }
    }
    projects(filter: { state: { type: { eq: "started" } } }) {
      nodes { id name progress targetDate projectMilestones { nodes { name targetDate } } }
    }
  }
}
```

## Workflow Tips

- **Always tag roles** in issue titles for filtering and assignment clarity
- **Use milestones** to phase work and track pipeline progress
- **Buffer estimates** – creative work has iteration cycles
- **Chris's Review Required** for any deliverable before handoff to engineering
- **Live Review** for anything subjective or requiring real-time feedback
- **Log contractor hours** in issue comments or description for budget tracking

## References

- **Workflows:** `references/workflows.md` – Full templates for Art Production, Content Expansion, Rebrand, Exploration
- **AYS Context:** `references/ays-context.md` – AYS Pre-Production project details, production pipeline (5-stage Volley process), initiative structure, Alpha/Beta scope, handoff artifacts, Notion pages, key people, and team composition
- **Team:** `references/team.md` – Full roster, contractor assignments, budget tracking

---

## Kaleidoscope Workspace (Agent-Driven Projects)

Chris also has a separate **Kaleidoscope** Linear workspace for side business projects.

- **Team:** `KAL` | Team ID: `12668c47-c818-44e6-8d7e-d8cf05cfc22d`
- **Auth:** same `LINEAR_API_KEY` works; Juno agent ops use `LINEAR_AGENT_TOKEN`
- **Agent process:** See `memory/agent-project-process.md` for full setup + conventions
- **Workspace config:** See `memory/kaleidoscope-linear.md` for all IDs, issue map, milestones

### Key differences from Volley/DS workflow:

| Aspect | Volley DS | Kaleidoscope KAL |
|--------|-----------|-----------------|
| Auth | Personal API key | Personal key + agent OAuth token |
| Assignees | Real team members | Chris (owner) + Juno (agent comments) |
| Agent comments | N/A | Use `Bearer LINEAR_AGENT_TOKEN` |
| Issue ownership | Human roles | Juno (execution) vs Chris (decisions) |
| Dependency tracking | Milestone-based | Explicit `blocks` relations + Blocked label |

### Agent token — regenerate when expired (~30 days):
```bash
curl -X POST https://api.linear.app/oauth/token \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d 'grant_type=client_credentials&client_id=${LINEAR_CLIENT_ID}&client_secret=${LINEAR_CLIENT_SECRET}&scope=read,write,app:assignable,app:mentionable'
```
Save new token as `LINEAR_AGENT_TOKEN` in `.env`.
