---
name: project_external_dirs_relative_paths
description: "Hermes external_dirs must use relative paths (not ~/), because ~ expands to $HOME=/root not HERMES_HOME"
metadata: 
  node_type: memory
  type: project
  originSessionId: ae403c8a-9bab-40a2-965b-bb724940c12f
---

In `skills.external_dirs` in Hermes config.yaml, **never use `~/`** — use relative paths instead.

**Why:** `~/` expands via `os.path.expanduser()` to `$HOME=/root`, not `$HERMES_HOME` (e.g. `/opt/hermes-profiles/juno`). With custom profile paths, `/root/.agentos-skills/skills` doesn't exist and Hermes silently skips the entire directory — all skills become invisible. Relative paths (no leading `~/`) are resolved against HERMES_HOME by `get_external_skills_dirs()`.

**How to apply:** Any time external_dirs is set in config.yaml or a new skill dir is added, use:
```yaml
skills:
  external_dirs:
    - .agentos-skills/skills      # resolves to HERMES_HOME/.agentos-skills/skills
    - .hermes/skills/             # resolves to HERMES_HOME/.hermes/skills (bundled skills)
```
Not `~/.agentos-skills/skills`. Fixed fleet-wide in agentos-config PR #266 (2026-06-17); applied live to VPS same day.

**Result of fix:** 149 skills now load per agent (was 0), including `hermes-agent` which teaches skill_manage self-improvement. `skill_manage_events` was 0 across all agents before this fix — watch for it to increment now.
