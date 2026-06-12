---
name: honcho-selfhost-state-2026-06-12
description: Self-hosted Honcho cutover to OpenAI — deriver PAUSED, $20 OpenAI cap hit mid-drain
metadata:
  type: project
---

# Honcho self-hosted state — 2026-06-12

Self-hosted Honcho v3.0.9 on the VPS (`http://100.117.92.5:8000`, Tailnet) was cut over from cloud/Ollama to **OpenAI for everything** on 2026-06-11.

**What's configured (`/opt/honcho/.env`, backup `.env.bak-20260611`):**
- `LLM_OPENAI_API_KEY` = real OpenAI key (also in AWS SM `agentos/honcho/openai_api_key`, us-east-1). Key has a **$20/mo cap**.
- `DERIVER_ENABLED=true`; dialectic + deriver + embeddings all on OpenAI (`gpt-5.4-mini`, `text-embedding-3-small`). Ollama base-URL overrides commented out.

**CURRENT PROBLEM — drain incomplete, deriver PAUSED:**
- The one-time backlog re-derivation (~7,500 work units) is far more token-heavy than expected. The **$20/mo OpenAI cap was exhausted in ~16h after ~2,560 units**, then every unit started failing with `429 insufficient_quota`, retrying 3× and spiking box load to ~40.
- **I stopped the deriver** (`cd /opt/honcho && docker compose stop deriver`) to stop the thrash and protect the shared box (also runs paperclip + agent gateways). Container `honcho-deriver-1` is **Exited** on purpose.
- State: ~2,560 units derived (incl. most of `chris`'s representation, ~66%+), **~5,400 units still pending**, ~414 failed on quota. `honcho-api`/database/redis still up; raw `/v3` REST works; `search`/`chat` partial/unreliable.

**TO RESUME (needs Chris's billing decision):** raise the OpenAI monthly cap (full drain likely needs ~$40–60 total, not $20), then `docker compose start deriver` and let it drain. Re-failed units auto-retry (they're `processed=false` with error). Watch the cap again. Until then, leave the deriver stopped.

**MCP cleanup done (2026-06-11):** removed cloud-pointed Honcho MCP — repo `.mcp.json` honcho server removed, `honcho@honcho` plugin disabled in `~/.claude/settings.json`, gitignored wrapper `.claude/honcho-mcp.sh` neutralized. No more accidental cloud billing. Reach self-hosted Honcho via `/v3` REST (`Authorization: Bearer $HONCHO_API_KEY`) — published JS SDK/MCP are `/v2`, box is `/v3`-only. Also: rotate the OpenAI key when convenient (was pasted in a chat).
