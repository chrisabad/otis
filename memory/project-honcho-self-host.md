# Project: Honcho Self-Host

**Status:** ALL 5 PHASES COMPLETE (2026-06-10)  
**Paperclip issue:** `74ca3009` (AGE)  
**Goal:** Replace `mcp.honcho.dev` cloud with a self-hosted Honcho instance on the AGE VPS to reduce costs.

## Completed (2026-06-10)

### Phase 1 — Deploy ✅
- Docker Compose at `/opt/honcho/docker-compose.yml` on VPS
- 4 containers: `honcho-api-1`, `honcho-database-1`, `honcho-deriver-1`, `honcho-redis-1`
- API bound to `100.117.92.5:8000` (Tailscale IP only — not localhost, not public)
- `.env` at `/opt/honcho/.env` with Ollama Cloud creds as deriver LLM

### Phase 2 — HTTPS ✅ (pragmatic)
- No HTTPS cert issued: Traefik can't cert `.ts.net` subdomains; Tailscale provides transport encryption
- Agents connect via `http://100.117.92.5:8000` — still encrypted end-to-end by Tailscale network layer

### Phase 3 — Data migration ✅
- Migration script at `/opt/honcho/migrate-from-cloud.py`
- Result: 10 peers, 23 sessions, 5534 messages migrated (7 truncated to 24900 chars)
- paperclip session: 4800/4800 messages migrated

### Phase 4 — Cutover ✅
- All 10 `/opt/hermes-profiles/*/honcho.json` updated: added `"baseUrl": "http://100.117.92.5:8000"`
- `.env` and `config.yaml` permissions fixed: `root:paperclip 640` so hermes-gateway (runs as `paperclip`) can read them
- hermes-gateway restarted and running healthy

## Phase 5 — COMPLETE ✅
- Cloud Honcho subscription cancelled (Chris, 2026-06-10)
- `HONCHO_API_KEY` removed from all 9 active agent `.env` files on VPS

## Key files
- Self-hosted API: `http://100.117.92.5:8000` (Tailscale-only)
- Docker Compose: `/opt/honcho/docker-compose.yml`
- Migration script: `/opt/honcho/migrate-from-cloud.py`
- Agent configs: `/opt/hermes-profiles/*/honcho.json` (all have `baseUrl` set)

## Notes
- `AUTH_USE_AUTH=false` on self-hosted (Tailscale is the auth layer)
- Honcho plugin reads `baseUrl` from honcho.json (takes priority over `HONCHO_BASE_URL` env var)
- V3 API: messages use `peer_id` field (not `role`), batch endpoint requires `{"messages": [...]}`
- **Deriver disabled** (`DERIVER_ENABLED=false`): Ollama Cloud doesn't support structured output (required by deriver). Basic session storage + context recall (`recallMode: "context"`) fully works. Dialectic queries still attempted but fail silently (non-fatal warnings in agent logs).
- Juno run failures are pre-existing Langfuse `_create_span_with_parent_context` noise, not Honcho-related
- `docker compose restart` does NOT re-read `.env` — must use `docker compose up -d` to pick up env changes
- Brief API downtime during container recreation causes "Connection refused" sync failures — plan restarts during low-activity periods
