# PRD: Fix Ollama Cloud → LiteLLM → Hermes chain for `pro`/`fast`/`routine`/`code` aliases
**Date:** 2026-05-04
**AGE Issue:** AGE-12598
**Author:** Otis
**Type:** Large

## Objective
Restore reasonable end-to-end latency (target <15s for typical Slack DM, <8s for routine LLM call) for all Hermes/Paperclip agents calling LiteLLM through `localhost:4000`. Slowness has been broken since the 2026-05-03 19:24 swap of `pro` from Weekend Sonnet to Ollama Cloud GLM-5.1, due to GLM-5.1's intrinsic thinking-model behavior bloating every response with 1500–4000 chars of reasoning that the proxy passes through unmodified.

## Files to be Changed
- `~/.litellm/config.yaml` — for each Ollama-routed entry (`pro` ×2, `fast` ×2, `routine` ×2, `code` ×2, `routine-code` ×2, `routine-code-glm` ×2, `code-glm` ×2, `writing` ×2), add:
  - `max_tokens: 4096` (bound completion length)
  - `extra_body: {enable_thinking: false}` (cuts reasoning ~50%, doesn't fully suppress)
- `~/.litellm/custom_callback.py` — add an `async_log_success_event` (or equivalent) hook that strips `reasoning_content` and `reasoning` fields from response choices before they leave the proxy. Goal: downstream agent message history never accumulates reasoning text.

## Cross-Agent Impact
Every agent on a `pro`/`fast`/`routine`/`code` alias is affected. Specifically:
- **Juno** (Slack-facing CEO): primary pain point — DMs went from ~15s to 8+ minutes. Should drop back to ~10–15s.
- **Axel, Quinn, Vera, Comms** (orchestration on `pro`): same improvement.
- **Ellis** (engineer, runs heartbeat routines on `routine`): faster heartbeat cycles, less wasted LLM cost on reasoning tokens.
- **Reed, Orion, others on `routine`/`code`**: same.
- **Otis** (me): I use `codex_local` per memory — not directly affected, but I observe the system through these agents' logs.

No expected behavior change for end-user content quality — model and provider unchanged, only the request envelope and response post-processing.

## Acceptance Criteria
- [ ] Direct curl to `pro` through LiteLLM: HTTP 200, non-empty `content`, no `reasoning_content` field, ≤8s wall time (warm).
- [ ] Same call without `max_tokens` doesn't `finish_reason: length` for trivial prompts.
- [ ] Slack DM to Juno gets a substantive reply in ≤20s wall time (allow buffer for Hermes overhead + Slack send).
- [ ] One Ellis routine heartbeat completes in nominal time and does not show empty-content failures in its session log.
- [ ] LiteLLM proxy comes back healthy after `docker restart litellm-proxy`; `/health/liveness` returns "I'm alive!" within 30s.
- [ ] No regression in `pro-claude` / `pro-gemini` direct calls (those bypass the GLM path).
- [ ] `~/.openclaw/workspace/agents/otis/memory/config-changes.md` entry added with AGE-12598 reference.

## Rollback Plan
- Backups taken before edit: `cp ~/.litellm/config.yaml{,.bak-YYYYMMDD-HHMMSS}` and same for `custom_callback.py`.
- Revert: `cp ~/.litellm/config.yaml.bak-YYYYMMDD-HHMMSS ~/.litellm/config.yaml` and `cp ~/.litellm/custom_callback.py.bak-YYYYMMDD-HHMMSS ~/.litellm/custom_callback.py`.
- `docker restart litellm-proxy`.
- Total rollback ≤2 min.

## Risks & mitigations
- **YAML syntax error breaks all LLM calls** — mitigated by `python3 -c "import yaml; yaml.safe_load(open(...))"` validation before restart, and by keeping the backup hot.
- **`enable_thinking: false` ignored by Ollama or LiteLLM** — best-case it's a no-op; worst-case Ollama 400s. Verified to be accepted in pre-flight curl tests.
- **`custom_callback.py` strip logic strips too aggressively** — only modify `response.choices[*].message`, leave `usage`, `id`, etc. alone. Behind a feature-flag-style check (`if msg.get("reasoning_content") or msg.get("reasoning")`) so it's a no-op for non-thinking models.
- **Restart blip affects all agents for ~30s** — minor; agents will retry. Schedule outside of any active Juno DM flow if possible.

## Peer Review
@Quinn — Does this affect any QA workflow you're running, and does the `custom_callback.py` strip logic look safe to you? Specifically: are any current consumers of LiteLLM responses reading `reasoning_content` (vs `content`)?

30-min window opens at: 2026-05-04 20:17 PT
Result: [pending]

## Out of scope (deferred to separate AGE issue)
- Repair `pro-claude` (Weekend Sonnet bridge timeout at `host.docker.internal:8082`).
- Whether GLM-5.1 is the right primary tier for *Juno* specifically (product/UX call).
- Whether to reorder fallback chain so a working `pro-gemini` is reachable when both Ollama and Weekend bridge fail.
