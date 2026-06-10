# Project: Honcho Self-Host

**Status:** Phases 1–4 COMPLETE — in 24h soak before Phase 5 decommission  
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

## Phase 5 — Still needed (after 24h soak)
- Validate one full heartbeat run with self-hosted Honcho (check logs for `base_url: http://100.117.92.5:8000`)
- Cancel cloud Honcho subscription
- Delete cloud API key (`hch-v3-92j1...`) from `.env` and agent profiles

## Key files
- Self-hosted API: `http://100.117.92.5:8000` (Tailscale-only)
- Docker Compose: `/opt/honcho/docker-compose.yml`
- Migration script: `/opt/honcho/migrate-from-cloud.py`
- Agent configs: `/opt/hermes-profiles/*/honcho.json` (all have `baseUrl` set)

## Notes
- `AUTH_USE_AUTH=false` on self-hosted (Tailscale is the auth layer)
- Honcho plugin reads `baseUrl` from honcho.json (takes priority over `HONCHO_BASE_URL` env var)
- V3 API: messages use `peer_id` field (not `role`), batch endpoint requires `{"messages": [...]}`
