---
name: hermes-agent-skill-authoring
description: "Author SKILL.md files for the AGE fleet. Use when creating or editing skills in chrisabad/agentos-skills or Otis's .claude/skills/."
version: 1.1.0
author: Hermes Agent (adapted for AGE by Otis)
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [skills, authoring, hermes-agent, conventions, skill-md, agentos]
    related_skills: [agentos-infrastructure, agentos-sdlc]
---

# Authoring AGE Skills (SKILL.md)

## Overview

AGE uses Hermes SKILL.md format for all skills. There are two AGE skill locations:

1. **Fleet skills** — `chrisabad/agentos-skills` → `skills/<name>/SKILL.md`
   - Deployed to all Hermes agents and Otis via CI rsync
   - Deployed to: `/docker/paperclip-ezk7/data/.agentos-skills/skills/` (Hermes agents)
   - Also to: `/Users/cabad/Documents/GitHub/otis/.claude/skills/` (Otis local)
   - Commit + PR to `agentos-skills` → CI deploys automatically

2. **Otis-only skills** — `chrisabad/otis` → `.claude/skills/<name>/SKILL.md`
   - Only available in Otis Claude Code sessions
   - Checked into the otis repo, no CI needed
   - Use for COO/infrastructure skills not relevant to fleet agents

## When to Use

- You've solved a repeatable problem and want to encode the procedure for future sessions
- You're filling a skill gap identified in the fleet (self-improvement loop)
- You're adapting a third-party skill for AGE context

**Don't use for:**
- One-off procedures that won't generalize
- Skills that duplicate existing ones — extend instead

## Required Frontmatter

Source of truth: Hermes validator. Hard requirements:

- Starts with `---` as the **first bytes** (no leading blank line, no BOM)
- Closes with `\n---\n` before the body
- Parses as valid YAML
- `name` field present (lowercase, hyphens, ≤ 64 chars)
- `description` field present, ≤ **1024 chars**, starts with "Use when ..."
- Non-empty body after the closing `---`

Standard shape for AGE skills:

```yaml
---
name: my-skill-name
description: "Use when <trigger>. <one-line behavior>."
version: 1.0.0
author: Otis (AGE)
license: MIT
audience: shared
---
```

`audience: shared` makes it available to all fleet agents. Omit for Otis-only skills.

## Size Limits

- Description: ≤ 1024 chars (enforced)
- Full SKILL.md: ≤ 100,000 chars (~36k tokens)
- Aim for 8–14k chars. Above 20k, offload to `references/*.md` and link from SKILL.md.

## Structure Template

```
# <Title>

## Overview
What this skill does and why it exists.

## When to Use
- Bullet triggers
- "Don't use for:" counter-triggers

## <Topic sections>
Quick-reference tables, exact commands, recipes.

## Common Pitfalls
Numbered list of mistakes and fixes.

## Verification Checklist
- [ ] Checkbox list of post-action verifications
```

`Overview` + `When to Use` + actionable body + pitfalls are the minimum.

## Workflow: Fleet Skill (agentos-skills)

1. **Check for existing skills** — browse `chrisabad/agentos-skills/skills/` before creating
2. **Draft locally** — write to `skills/<name>/SKILL.md` in a worktree or local clone
3. **Validate frontmatter:**
   ```python
   import yaml, re, pathlib
   content = pathlib.Path("skills/<name>/SKILL.md").read_text()
   assert content.startswith("---"), "No leading whitespace before ---"
   m = re.search(r'\n---\s*\n', content[3:])
   fm = yaml.safe_load(content[3:m.start()+3])
   assert "name" in fm and "description" in fm
   assert len(fm["description"]) <= 1024
   assert len(content) <= 100_000
   ```
4. **PR to agentos-skills** — CI deploys to VPS on merge to main
5. **Verify on VPS** after CI: `ls /docker/paperclip-ezk7/data/.agentos-skills/skills/<name>/`

## Workflow: Otis-Only Skill

1. Write to `/Users/cabad/Documents/GitHub/otis/.claude/skills/<name>/SKILL.md`
2. Commit directly to main (no PR needed — otis repo uses direct commits)
3. Available immediately in the next Otis session

## Editing Existing Skills

- **Small fix** (typo, added pitfall): edit the file directly, commit
- **Major rewrite**: rewrite the whole SKILL.md
- **Always commit** — skills are source, not runtime state

## Common Pitfalls

1. **Leading whitespace before `---`** — validator checks `content.startswith("---")`; any leading blank line fails
2. **Wrong destination** — fleet skills go in `agentos-skills`, not in `otis/.claude/skills/` (unless Otis-only)
3. **Forgetting to PR** — a skill only in a local worktree never deploys; it needs a PR to agentos-skills
4. **Description too generic** — "Use when debugging X" beats "Debug X"; describe the trigger class
5. **Duplicating a peer** — check existing skills first; extend rather than create a narrow sibling
6. **Current session won't see new skills** — skill loader is initialized at session start; verify in a fresh session

## Verification Checklist

- [ ] Frontmatter starts at byte 0 with `---`, closes with `\n---\n`
- [ ] `name`, `description` present; name ≤ 64 chars; description ≤ 1024 chars, starts with "Use when ..."
- [ ] Total file ≤ 100,000 chars (aim 8–14k)
- [ ] Structure: Overview → When to Use → body → Pitfalls → Checklist
- [ ] For fleet skills: PR to `chrisabad/agentos-skills` submitted and CI passes
- [ ] For Otis-only: committed to main in `chrisabad/otis`
