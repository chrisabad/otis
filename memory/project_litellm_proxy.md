---
name: project-litellm-proxy
description: "LiteLLM proxy deployed on srv1724463.hstgr.cloud, wired as LLM gateway for 10 fleet agents with 4 semantic aliases"
metadata: 
  node_type: memory
  type: project
  originSessionId: 4e374208-14d0-43a7-aed6-fc6b9f60dd8b
---

LiteLLM proxy is live on a dedicated Hostinger VPS (`srv1724463.hstgr.cloud`, IP `2.25.162.2`), separate from the main Paperclip VPS (`100.117.92.5`). Both VPSes are on the same SSH key (`agentos/otis/vps_ssh_key` in AWS SM). Tailscale is how we connect between machines.

**Why:** Per-agent budget controls and automatic key rotation to prevent a single agent's retry storm from exhausting the fleet's Ollama quota (as happened 2026-06-14 with AGE-824).

**LiteLLM admin key:** stored in AWS SM `agentos/litellm/master_key` (us-east-1). Fetch: `aws secretsmanager get-secret-value --secret-id agentos/litellm/master_key --region us-east-1 --query SecretString --output text`
**Docker port:** container runs on `0.0.0.0:42171->4000/tcp` — access via `http://srv1724463.hstgr.cloud:42171`
**Container name:** `litellm-nnhx-litellm-1`

**Semantic model aliases (as of 2026-06-16):**
- `lightweight` → `openai/ministral-3:3b` (Low tier) — aux simple tasks (title_gen, approval, mcp, skills_hub, profile_describer)
- `routine` → `openai/deepseek-v4-flash` (Medium tier) — main model for most agents + aux heavy tasks; passes t3/t5/t6
- `interactive` → `openai/gemma4:31b` — Juno/Piper; re-validated 2026-06-16 (t6×3 + t3 + t5 pass); replaced glm-5.1:cloud
- `vision` → `openai/gemma3:12b` (multimodal) — vision auxiliary slot fleet-wide
- All aliases: `ollama-kaleidoscope` credential only (chrisabad Free tier blocks Medium+; recheck subscription ~2026-06-21)

**10 real agents** registered in LiteLLM Agentic section with per-agent virtual keys. RPM tiers (as of 2026-06-16):
- 30 RPM: juno, axel
- 60 RPM: ellis (raised from 20 on 2026-06-16 — 20 was causing "Adapter failed" during concurrent dispatch bursts)
- 20 RPM: nell, piper, hollis, morgan, quinn
- 10 RPM: willa, tess
- (juno-fon, juno-per deprecated and keys deleted 2026-06-16)

**Fleet wiring (Paperclip VPS 100.117.92.5):**
- `/opt/hermes-profiles/<agent>/.env`: `OLLAMA_API_KEY=sk-<virtual-key>` + `LITELLM_BASE_URL` + `LITELLM_API_KEY` (master, for skill use)
- `/opt/hermes-profiles/<agent>/config.yaml`: `base_url: http://srv1724463.hstgr.cloud:42171/v1`
- Hermes Langfuse plugin DISABLED fleet-wide (all 17 profiles) — LiteLLM→Langfuse is active
- Juno + Piper: Hermes default model = `interactive`; all others: `routine`

**Langfuse integration:** LiteLLM sends traces to `https://langfuse-lugt.srv1724463.hstgr.cloud` via callback. Real token counts and model names now captured (vs zeros/"unknown" from old Hermes plugin).

**Eval infrastructure (2026-06-15):**
- Eval wrapper: `/opt/hermes-wrappers/eval.sh` — direct Ollama, valid board key
- Eval profile: `/opt/hermes-profiles/eval-direct/` — bypasses LiteLLM
- Eval skill: `.claude/skills/model-eval/SKILL.md`

**How to apply:** When managing LLM access, models, or per-agent budgets — use the LiteLLM API at `:42171`. To update the `routine` alias: `POST /model/delete` old IDs + `POST /model/new` with new model. To add chrisabad key-b back when it resets (~2026-06-21), add a third round-robin entry.

**litellm-proxy skill:** Installed at `/opt/hermes-profiles/shared/skills/devops/litellm-proxy/SKILL.md` (and per-agent copies). `agents: [otis]` restriction removed 2026-06-16 — now available fleet-wide. All 10 agent `.env` files have `LITELLM_BASE_URL` and `LITELLM_API_KEY` (master key) injected so any agent can invoke the skill.

**PENDING:** Clean up juno's duplicate `juno-key` virtual key Chris created through UI wizard.
