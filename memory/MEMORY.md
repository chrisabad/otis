# Memory Index

- [User: Chris](user-chris.md) — Chris's role, how he works with Otis, session style
- [Feedback: No OpenClaw](feedback-no-openclaw.md) — Hermes is the primary harness; OpenClaw is decommissioned
- [Feedback: Commit to main directly](feedback-commit-to-main.md) — no PRs for this repo; commit at end of session
- [Project: Plugin fixes 2026-05-30](project-plugin-fixes-2026-05-30.md) — executionPolicy bug fixed, prefix removal, dispatcher dead code cleaned up; verified working
- [Project: Zapier SDK](project-zapier-sdk.md) — SDK + skill installed fleet-wide (AGE-239); Zapier client credentials (AGE-250) + VPS auto-deploy still needed
- [Project: Honcho self-host](project-honcho-self-host.md) — migrating from mcp.honcho.dev cloud to VPS self-hosted (cost reduction); Paperclip issue 74ca3009 assigned Axel; 5-phase spec: Docker Compose deploy → Caddy/Tailscale HTTPS → data migration → cutover (2 file changes in repo) → decommission cloud key
- [Handoff 2026-06-10](handoff-2026-06-10.md) — PR cleanup complete: AGE-780/AGE-768 merge conflicts resolved, tests-pr fixed (212 tests), docs PR merged; all AGE-5 migration PRs landed; bot tokens auto-refreshing; remaining: PR #44 (stale), AGE-784, Langfuse noise
