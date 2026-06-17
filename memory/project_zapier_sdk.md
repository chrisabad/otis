---
name: project-zapier-sdk
description: Zapier SDK skill installation status and follow-up needed for agent auth
metadata:
  type: project
---

Zapier SDK skill installed across fleet (AGE-239, completed 2026-06-01).

**What's done:**
- `@zapier/zapier-sdk` v0.65.0 installed on VPS at `/opt/zapier-sdk/`
- Official skill installed via `npx skills add zapier/sdk -y` (Zapier-provided, not hand-authored)
- Skill committed to `chrisabad/agentos-skills/skills/zapier/SKILL.md`
- Skill committed to `chrisabad/otis/.claude/skills/zapier/SKILL.md` (available in Otis cloud sessions after next repo pull)
- Visible to all 7 Hermes agent profiles via `external_dirs`

**Still needed:**
- Zapier client credentials (`ZAPIER_CREDENTIALS_CLIENT_ID` + `ZAPIER_CREDENTIALS_CLIENT_SECRET`) must be provisioned before any agent calls `sdk.runAction()`. Browser OAuth (`npx zapier-sdk login`) doesn't work headless on VPS — needs client credentials from Zapier dashboard.
- VPS `~/.agentos-skills` needs `git pull` to pick up the GitHub commit (local install is ahead, but repo is behind).

**Why:** Centralizing tool access across Hermes agents + Otis via Zapier's 9,000+ app connectors instead of each agent maintaining custom integrations.

**How to apply:** When an agent needs to use Zapier, check whether client credentials are configured first.
