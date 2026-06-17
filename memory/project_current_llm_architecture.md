---
name: current-llm-architecture
description: Current AGE LLM path is Hermes → Ollama Cloud direct (NO LiteLLM). The 2026-05-04/05 LiteLLM PRDs are dead-era and must not be trusted.
metadata: 
  node_type: memory
  type: project
  originSessionId: 252f61e3-974b-4f7d-ac3d-c1a5e64094a6
---

The fleet's LLM delivery path as of the 2026-05-27 cloud migration (spec `specs/cloud-migration-2026-05-27.md`, v1.2):

`Paperclip → hermes-paperclip-adapter (shells to hermes CLI) → Nous Research Hermes agent → Ollama Cloud directly`

- **LiteLLM is decommissioned.** No proxy, no `~/.litellm/config.yaml`, no `custom_callback.py` in the live path. Ollama Cloud is credential-pooled (×2 accounts, multi-key) configured in `~/.hermes/config.yaml`.
- Agents run `hermes_local` adapter, `provider: auto`, talking to Ollama Cloud via `https://ollama.com/v1` (OpenAI-compat) per `~/.hermes/config.yaml`. hermes binary: `/opt/hermes-venv/bin/hermes`; wrappers at `/opt/hermes-wrappers/<agent>.sh` set HERMES_HOME=`/opt/hermes-profiles/<agent>`. Invocation: `hermes chat -q "<prompt>" -Q -m <model> --provider <p>`. Bare model names work (e.g. `glm-5.1`, `gpt-oss:20b`) — `:cloud` suffix is optional/Ollama-native-API convention.
- **FLEET MODEL TIERING (set 2026-06-03, AGE-295):** two tiers, assigned per-agent via `adapterConfig.model`. HEAVY `glm-5.1`: Juno, Quinn, Ellis (reviewers/orchestrator — reasoning-critical). LIGHT `gpt-oss:20b`: Axel, Vera, Orion, Dex. Chosen by a real-harness eval (see below). `qwen3-coder-next` DEPRECATED (coder model: rewrites instead of reviewing, returns empty on investigation, drops instructions). `minimax-m2.5`/`glm`-echo-era is over.
- **Eval method that matters:** test models through the REAL hermes harness (SSH to VPS, run `hermes chat -m <model>`), NOT direct Ollama API calls — direct-API results were actively misleading (qwen3-coder-next looked fine on API, failed in harness). Otis CAN SSH the VPS from the Mac: Tailscale app running (binary at `/Applications/Tailscale.app/Contents/MacOS/Tailscale`, not in PATH), key from AWS SM `agentos/otis/vps_ssh_key` → `root@100.117.92.5`. Unpause agents via `POST /api/agents/<id>/resume`; wake via `/wakeup`.
- Otis runs `claude_local` (Anthropic direct) — never touches Ollama.
- Hermes (Nous Research, `pip install hermes-agent`) has native DIRECT providers: `auto, openrouter, nous, openai-codex, copilot, anthropic, huggingface, zai, kimi-coding, minimax, minimax-cn, kilocode`. Model-name inference maps `minimax→minimax`, `glm-→zai`, `claude→anthropic`. So MiniMax/GLM can run via their own APIs instead of Ollama Cloud by setting `provider` explicitly.

**Why:** Migration killed LiteLLM/Infisical/Graphiti to cut local RAM (~9GB) and move to ~$20/mo cloud.

**How to apply:** Any LLM-routing question (latency, tool use, model behavior, cost) must be reasoned about against THIS path. The `memory/prds/2026-05-04-litellm-*` and `2026-05-05-litellm-*` files describe the dead pre-migration architecture — do NOT use them to diagnose current behavior. See [[verify-before-diagnosing]]. Related diagnosis: [[ollama-cloud-tool-echo-bug]].
