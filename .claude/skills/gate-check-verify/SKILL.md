---
name: gate-check-verify
description: "Deterministic verification of gate-check acceptance criteria via live queries against system state. Produces structured evidence bundles instead of letting an LLM run ad-hoc check queries. Use when processing a [gate-check] issue before writing pass/fail conclusions."
version: 1.0.0
audience: shared
---
# Gate-Check Verification Skill

## Purpose

Deterministically verify gate-check acceptance criteria by running queries against live
system state and producing structured evidence bundles. The LLM (Juno) should never
run ad-hoc queries to "check" criteria — this skill runs the queries and captures real
output. Juno's job reduces to: read the bundle, mark each criterion pass/fail, write
a summary.

## When to Use

Called when Juno (or any agent) is processing a `[gate-check]` issue. Run this skill
BEFORE writing conclusions about acceptance criteria.

## How to Use

```bash
python3 ~/.agentos-skills/skills/gate-check-verify/gate_check_verify.py --issue <IDENTIFIER> [--company <COMPANY_ID>] [--api-key <KEY>] [--api-url <URL>]
```

### Arguments

| Argument | Required | Default | Description |
|----------|----------|---------|-------------|
| `--issue` | Yes | — | Gate-check issue identifier (e.g., `AGE-5906`) |
| `--company` | No | AGE company ID | Paperclip company ID to scope queries |
| `--api-key` | No | From `.env` | Paperclip API key |
| `--api-url` | No | `http://127.0.0.1:3101` | Paperclip API base URL |

### Output

Structured evidence bundle printed to stdout in markdown format, with one `### Criterion N`
section per acceptance criterion, each containing a fenced code block with the raw query
output. This format is required by the AGE-6129 gate-check evidence enforcement plugin.

## Evidence Block Format

Each evidence block follows this structure:

```markdown
### Criterion 1: <criterion title from issue>

\`\`\`
<query command>
\`\`\`

\`\`\`evidence
<raw output of the query>
\`\`\`

**Status**: PASS | FAIL | ERROR — <brief explanation>
```

## Criterion Types and Queries

The skill recognises these criterion types from gate-check issue descriptions and
runs the corresponding deterministic queries:

### Agent List (S-5 family)
**Trigger keywords:** "agent", "agents in config", "agent list", "sidebar"

```bash
curl -s "http://127.0.0.1:3101/api/companies/{company_id}/agents" -H "Authorization: Bearer {key}"
```

### Config Inspection (S-5/S-6 family)
**Trigger keywords:** "config", "config.yaml", "adapterConfig", "adapter config"

```bash
python3 -c "import json; c=json.load(open('/home/hermes/.hermes/config.yaml')); agents=c.get('agents',{}); [print(name, 'adapterConfig' in agent and 'type' in agent.get('adapterConfig',{}) ) for name,agent in agents.items()]"
```

### Routine Counts
**Trigger keywords:** "cron", "routine", "heartbeat", "schedule"

```bash
python3 -c "import json; c=json.load(open('/home/hermes/.hermes/config.yaml')); crons=c.get('crons',{}); print(f'Total crons: {len(crons)}'); [print(f'  {name}: {v}') for name,v in list(crons.items())[:20]]"
```

### Issue Status
**Trigger keywords:** "issue", "done", "in_progress", "blocked", "status"

Scans dependent issues referenced in `Blocks on` / `Blocked by` sections and reports
their current status from Paperclip.

### Gateway Health
**Trigger keywords:** "gateway", "health", "latency", "uptime"

```bash
hermes gateway status
```

### Memory/Memory Search
**Trigger keywords:** "memory", "memory_search", "recall"

Reads agent memory files from workspace.

### Docker/Service
**Trigger keywords:** "docker", "compose", "container", "neo4j", "graphiti"

```bash
docker compose ps
```

## Adding New Criterion Types

To add a new criterion type:

1. Add a trigger keyword to `CRITERION_KEYWORDS` in `gate_check_verify.py`
2. Add a query handler function decorated with `@register_query`
3. Test with `--dry-run` flag to verify output format

## Error Handling

- If a query fails, the evidence block records `ERROR: <message>` and the criterion
  is marked `ERROR` rather than `FAIL`
- If the issue has no parseable acceptance criteria, the skill reports a list of
  found sections and exits with code 1
- Network errors are caught and reported — the skill never fabricates results

## Relationship to AGE-6129 Plugin

The Paperclip `kaleidoscope-issue-trigger` plugin (v1.21.0+) enforces that gate-check
issues transitioning to `done` MUST contain evidence blocks in their final comment.
This skill produces evidence blocks in the exact format the plugin expects. If the
evidence blocks are absent, the plugin reverts the issue to `in_progress` with an
explanation comment.

## On FAIL: File remediation issues (AGE-6130 revised 2026-04-22)

When any criterion is FAIL or ERROR, Juno files `[remediation]`-prefixed issues
directly from the gate-check session — one issue per unmet criterion.

**Required in each remediation issue:**

1. **Title**: `[remediation] <gate-id>: <specific fix>` (e.g., `[remediation] AGE-6101: Fix Graphiti client search parsing bug`)
2. **Description must include**:
   - The evidence block from this skill (copied verbatim)
   - The criterion that failed
   - The proposed fix (concrete — file path, function, expected behavior)
3. **Blocks the gate-check**: link `blockedByIssueIds` → remediation → gate-check
4. **Assignee**: appropriate implementer (usually Axel for code fixes, Ellis for platform/config)

**Decision gate before filing:**

- Straightforward bug fix or missing infrastructure → file directly
- Tier-2 change (routing / retrieval surface / spend — tokens, embeddings, external API costs) → escalate to Chris via Slack BEFORE filing, since these have broader blast radius

**Scope-creep defense (AGE-6447 plugin update):**

The `kaleidoscope-issue-trigger` plugin v1.27.0+ allows `[remediation]`-prefixed CEO
issues to pass through. Any non-`[gate-check]` / non-`[remediation]` issue created by
Juno during a gate-check session is auto-blocked with a `structural_change` approval
routed to Chris. This catches scope creep (unrelated work snuck in under cover of
gate-check) while allowing the legitimate remediation workflow.

**What replaced the old protocol:**

Prior to 2026-04-22, gate-check FAILs posted `REQUEST-REMEDIATION` comments on the
gate-check issue. That pattern had no downstream consumer — agents don't scan comments
for triage, Chris wasn't triaging manually. Gate-checks sat in `blocked:external` for
days. The revised protocol closes the loop by making Juno the triager (with evidence
grounding from this skill as the safeguard against AGE-6081-style phantom remediation).

## Related

- AGE-6129: Plugin enforcement (this skill's companion)
- AGE-6130: Separate verify from remediate (original, superseded 2026-04-22)
- AGE-6128: Multi-company read access (prereq for cross-company gate-checks)
- AGE-6447: Plugin exemption for `[remediation]` prefix (the Juno-as-triager enablement)