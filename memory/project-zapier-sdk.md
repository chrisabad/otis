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
- Skill committed to `chrisabad/otis/.claude/skills/zapier/SKILL.md` (available in cloud sessions)
- Visible to all 7 Hermes agent profiles via `external_dirs`

**Still needed:**
- AGE-250: Zapier client credentials (`ZAPIER_CREDENTIALS_CLIENT_ID` + `ZAPIER_CREDENTIALS_CLIENT_SECRET`) must be provisioned before any agent calls `sdk.runAction()`. Browser OAuth does not work headless on VPS — needs client credentials from Zapier dashboard, stored in AWS Secrets Manager at `agentos/zapier/credentials`.
- VPS auto-deploy gap: `deploy-skills.yml` GitHub Action runs on `self-hosted, agentos-mac` only — VPS skill sync is currently manual (`git pull` by Axel). Needs a VPS runner or SSH deploy step.

**Why:** Centralizing tool access across Hermes agents + Otis via Zapier's 9,000+ app connectors instead of each agent maintaining custom integrations.

**How to apply:** When an agent needs to use Zapier, check whether client credentials are configured first (AGE-250).
