# Project: Honcho Self-Host

**Status:** In progress — Axel assigned, backlog  
**Paperclip issue:** `74ca3009` (AGE)  
**Goal:** Replace `mcp.honcho.dev` cloud with a self-hosted Honcho instance on the AGE VPS to reduce costs.

## Current integration surface

- `.claude/honcho-mcp.sh` — `npx mcp-remote https://mcp.honcho.dev` with `Authorization: Bearer $HONCHO_API_KEY`
- `.env` — `HONCHO_API_KEY=hch-v3-92j1...` (cloud key)
- `/opt/hermes-profiles/*/honcho.json` on VPS — per-agent plugin configs pointing at cloud URL

## Migration spec (5 phases, Axel owns all VPS work)

1. **Deploy** — Docker Compose on VPS: API (port 8000) + deriver worker + Postgres/pgvector + Redis. Deriver LLM: Ollama Cloud via OpenAI-compat transport, using existing fleet Ollama credentials.
2. **Caddy** — Tailscale-only HTTPS: `honcho.{tailscale-hostname}.ts.net` → localhost:8000. No public exposure.
3. **Data migration** — Script to GET all apps/sessions/messages from cloud (`Agentos` workspace) and POST to self-hosted; assert row counts match before cutover.
4. **Cutover** — Two repo file changes: swap URL in `.claude/honcho-mcp.sh` (drop `Authorization` header — no auth on self-hosted), comment out `HONCHO_API_KEY` in `.env`. Update `/opt/hermes-profiles/*/honcho.json` on VPS.
5. **Validate & decommission** — 24h soak, then cancel cloud subscription and delete cloud API key.

## Notes

- No maintenance window needed — cutover is a config swap
- `AUTH_USE_AUTH=false` on self-hosted (Tailscale is the auth layer)
- If deriver model causes issues, refer to fleet eval table in RUNBOOK.md for model alternatives
