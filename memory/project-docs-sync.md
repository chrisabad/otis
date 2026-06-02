# Docs Sync — Cloud Migration + Nightly Routine

## What happened (2026-06-02)

### Doc update PR
- **PR**: `chrisabad/agentos-docs#22` (draft) — cloud migration sync
- **Branch**: `claude/docs-sync-cloud-migration-SiiYl`
- **13 files changed**: rewrote for Hostinger VPS + Hermes-direct topology
- **2 new pages**: `infrastructure/vps.mdx`, `operations/cloud-runbook.mdx`
- Previous docs described macOS/launchd/LiteLLM/Infisical/Reed topology — now reflects live cloud reality

### Nightly docs sync routine
- **Routine ID**: `ef0dc8f9-15d5-4f56-91fa-b5e1f8e75195`
- **Name**: "Nightly docs sync — review commits and update agentos-docs"
- **Schedule**: `0 2 * * *` UTC (02:00 UTC / ~7pm PT)
- **Assigned to**: Axel (`a83301c2`)
- **Next run**: 2026-06-03T02:00:00Z
- **Note**: Two schedule triggers exist (both `0 2 * * *`) due to API quirk. `coalesce_if_active` means only one issue fires per night.

### Repos reviewed for the nightly routine
- `chrisabad/otis` — HEARTBEAT.md, SOUL.md, AGENTS.md changes
- `chrisabad/agentos-config` — agent profiles, CI changes
- `chrisabad/agentos-skills` — skill changes
- `chrisabad/paperclip-issue-trigger` — plugin/routing changes
