# PRD: Replace GLM-5.1 with minimax-m2.5 as pro/routine primary
**AGE-12882** | 2026-05-05 | Otis

## Problem

GLM-5.1 is the current primary for `pro` and `routine` LiteLLM virtual models. It is exhibiting:
- 45–65s latency on planning/complex tasks (Ollama Cloud degradation)
- 8+ minute Slack roundtrips on Juno (AGE-12598, fixed thinking overhead but latency remains)
- GLM-5.1 thinking tokens fire even with `enable_thinking: false` — just suppressed from output

## Evaluation (conducted 2026-05-05, session 146d9e79)

4 models tested across 4 representative tasks via Ollama Cloud direct (identical raw conditions):

| Model | Avg Speed | T3 Planning | Thinking Overflow | Notes |
|-------|-----------|-------------|-------------------|-------|
| minimax-m2.5 | **8.95s** | 19.1s ✅ | None | Domain-aware output |
| minimax-m2.7 | 18.8s | 44.0s ✅ | None | Good fallback |
| glm-5.1 (current) | 27.8s | 64.7s ✅ | Present (suppressed) | Slow |
| kimi-k2.6 | ~37s (3/4) | ❌ null | **Overflow** | Needs enable_thinking:false |

minimax-m2.5 is **3.1× faster** than GLM-5.1 on our workloads, passes all 4 quality tests (JSON output, issue triage, multi-step planning, format following), and shows no thinking overflow risk.

kimi-k2.6 is deferred — thinking overflow without config tuning; high benchmark scores assume thinking enabled.

## Proposed Change

Replace primary model entries in `~/.litellm/config.yaml`:

### `pro` virtual model (Juno CEO orchestration)
- LB entry 1: `model: ollama_chat/glm-5.1` → `model: ollama_chat/minimax-m2.5`
- LB entry 2: `model: ollama_chat/glm-5.1` → `model: ollama_chat/minimax-m2.5`
- `extra_body: {enable_thinking: false}` → remove (minimax doesn't need it)
- `max_tokens: 4096` → keep (safe default)

### `routine` virtual model (Reed/Ellis/Orion/Axel/Diag/Supervisor heartbeats)
- Same swap pattern as pro

### `pro-code`, `code`, `routine-code`, `code-glm`, `routine-code-glm` (code-specialized)
- These are code variants that currently use glm-5.1
- Swap to minimax-m2.5 as well — minimax models handle code well (BFCL multi-turn 76.8%)

### LB fallback entries (glm-5.1 in Weekend/Gemini fallback chain)
- No change — Weekend Sonnet/Haiku and Gemini Pro/Flash are the fallbacks, not glm-5.1
- glm-5.1 only appears in the primary Ollama Cloud LB slots

### Files Changed
- `~/.litellm/config.yaml` — 16 model_list entries modified (all glm-5.1 Ollama-routed primary entries)

### Config flags to update per entry
- Remove `extra_body: {enable_thinking: false}` — not needed for minimax
- Keep `max_tokens: 4096`
- Keep `api_base` and `api_key` (Ollama Cloud auth unchanged)

## Risks

- minimax-m2.5 is less tested in production — first production deployment
- Context window: minimax-m2.5 has 204K context vs GLM-5.1's unknown; should be sufficient
- Speed win may vary — test suite used Ollama Cloud direct, production goes through LiteLLM proxy
- Rollback: restore from backup, restart LiteLLM (~7 min with Prisma migrations)

## Test Plan

1. After restart, PONG test on `pro` and `routine` via LiteLLM — verify latency <30s
2. Juno Slack roundtrip DM test — target <60s end-to-end (vs 8+ min current)
3. Watch Ellis/Reed/Axel next heartbeat runs — confirm exit 0 and real LLM output

## Peer Review

@Quinn — does this change affect any content-studio or coding agent routing you depend on?

30-min review window. Silence = no objection.
