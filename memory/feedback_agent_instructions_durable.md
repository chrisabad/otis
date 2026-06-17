---
name: feedback-agent-instructions-durable
description: "Agent instruction changes must be landed in chrisabad/agentos-config via PR, not just edited on the VPS"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 4d6fd2d2-c529-4747-86da-38f2867da8b6
---

Agent instruction changes (SOUL.md, AGENTS.md, HEARTBEAT.md, TOOLS.md, scripts in lib/) must always be made durable by updating `chrisabad/agentos-config` via a PR. CI deploys the repo to `/opt/hermes-profiles/` on merge to main — direct VPS edits are overwritten on the next deploy.

**Why:** Explicitly stated rule from Chris. Also matches the GitOps golden rule in CLAUDE.md and the agentos-infrastructure skill.

**How to apply:** When editing any agent profile file, work in a fresh clone or worktree of `chrisabad/agentos-config`, commit, push branch, open PR. Never edit `/opt/hermes-profiles/<agent>/` directly. Temp clones in `/tmp/` are fine for the work, but the final state must live in the repo before the session ends.
