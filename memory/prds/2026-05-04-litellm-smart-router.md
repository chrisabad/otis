# PRD: LiteLLM smart-router (complexity_router) — point Juno default at it
**Date:** 2026-05-04
**AGE Issue:** AGE-12601
**Author:** Otis
**Type:** Large

## Objective
Add LiteLLM's native `auto_router/complexity_router` virtual model to `~/.litellm/config.yaml` so the proxy classifies each request by message complexity and routes simple requests to a non-thinking model (`fast`) while leaving real work on `pro` (GLM-5.1). Repoint Juno's `model.default` from `pro` to `smart-router` as the first agent on the new path.

## Background
This is the LLM-side complement to AGE-12598. After AGE-12598 capped GLM-5.1's reasoning overhead and stripped `reasoning_content` from the response, a real question through `pro` is ~30s and a trivial "Hi" is still ~13s — because GLM-5.1 always emits 100+ tokens of reasoning regardless of input simplicity. The intrinsic-thinking-model overhead can't be configured away on a per-call basis; the only fix is to route trivial messages to a non-thinking model.

LiteLLM ships exactly this feature. From https://docs.litellm.ai/docs/proxy/auto_routing — `auto_router/complexity_router` is a virtual model that classifies each request across 7 heuristic dimensions (tokenCount, codePresence, reasoningMarkers, technicalTerms, simpleIndicators, multiStepPatterns, questionComplexity) in <1ms with zero LLM calls, then routes to one of four tier models. We're already running LiteLLM as the centralized proxy for all agents, so this is the right control plane.

A custom_callback `async_pre_call_hook` was the alternative; rejected because it reinvents what LiteLLM ships natively.

## Files to be Changed

### 1. `~/.litellm/config.yaml` — add `smart-router` virtual model

```yaml
- model_name: smart-router
  litellm_params:
    model: auto_router/complexity_router
    complexity_router_config:
      tiers:
        SIMPLE: fast
        MEDIUM: pro
        COMPLEX: pro
        REASONING: pro
      tier_boundaries:
        simple_medium: 0.15
        medium_complex: 0.35
        complex_reasoning: 0.60
    complexity_router_default_model: pro
  model_info:
    id: smart-router-v1
```

Initial mapping is conservative — only the SIMPLE tier differentiates (→ `fast`); MEDIUM/COMPLEX/REASONING all stay on `pro`. We can layer in `frontier-reasoning` for REASONING once the Weekend Sonnet bridge timeout is fixed (separate AGE issue).

Default tier_boundaries from LiteLLM docs are unmodified — we'll observe production scores via Langfuse traces and tune later.

### 2. `~/.hermes/profiles/juno/config.yaml` — repoint default

```yaml
model:
  default: "smart-router"   # was "pro"
  provider: "custom"
  base_url: "http://localhost:4000/v1"
  context_length: 200000
```

## Cross-Agent Impact
- **Juno** (Slack-facing CEO): primary beneficiary. "Hi" should drop from 13s to ~3s. Real questions stay on `pro` and unchanged from post-AGE-12598 baseline.
- **Other orchestration agents on `pro`** (Axel, Quinn, Vera, Comms): unaffected — they keep `model.default: "pro"` for this iteration. Fleet rollout is a separate follow-up after we observe Juno for 24-48h.
- **All agents calling `pro` directly** (vs. via smart-router): unaffected. The new `smart-router` is additive; existing aliases unchanged.

## Acceptance Criteria
- [ ] After `docker restart litellm-proxy`: `curl smart-router` with a trivial prompt completes in ≤5s warm with non-empty content. Logs / Langfuse trace shows `fast` was the underlying model.
- [ ] Same proxy with a complex prompt (1000+ tokens, code or reasoning markers) routes to `pro`. Trace shows `pro`.
- [ ] LiteLLM `/health/liveness` returns alive after restart.
- [ ] Direct calls to `pro`, `fast`, `routine`, etc. unchanged in behavior.
- [ ] Juno gateway restarts cleanly with new config; Slack reconnect verified.
- [ ] Slack DM "Hi" to Juno completes in ≤8s end-to-end (vs. 13s+ post-12598).
- [ ] config-changes.md entry added with AGE-12601 reference.

## Rollback Plan
- Backups before edit: `cp ~/.litellm/config.yaml{,.bak-<ts>}` and `cp ~/.hermes/profiles/juno/config.yaml{,.bak-<ts>}`.
- Revert config.yaml: `cp <bak> ~/.litellm/config.yaml && docker restart litellm-proxy` (~30s).
- Revert Juno: `cp <bak> ~/.hermes/profiles/juno/config.yaml && launchctl kickstart -k gui/$(id -u)/ai.hermes.gateway-juno` (~30s).
- Total rollback ≤2 min for either or both.

## Risks & Mitigations
- **complexity_router config syntax wrong** — mitigated by `python3 -c "import yaml; yaml.safe_load(...)"` before restart and the full LiteLLM docs config snippet pasted verbatim above.
- **LiteLLM rejects auto_router model at startup** — would surface in `docker logs litellm-proxy`. Rollback if so.
- **Tier boundaries too aggressive** — if SIMPLE matches non-trivial messages and they get a weak `fast` response, we observe and retune `simple_medium` upward. Defer-to-data approach.
- **Langfuse traces don't tag underlying model used** — verify by reading docker logs for `litellm.acompletion(model=openai/<X>)` lines correlated with the request's `id`.

## Peer Review
@Quinn — Does the conservative tier mapping (SIMPLE→fast, everything else→pro) match how QA expects routing to behave? Specifically: (a) anything in your eval workflow that explicitly depends on Juno's `model.default` being `pro`? (b) should "approval" requests get a different tier-promotion rule given they need careful judgment? (c) the per-request classification is heuristic-only (no LLM call) — comfortable with that, or want semantic_router considered?

30-min review window opens at: 2026-05-04 23:05 PT.
Result: [pending]

## Out of Scope (deferred AGE issues)
- Fleet-wide rollout to Axel/Quinn/Vera/Comms.
- REASONING tier mapped to `frontier-reasoning` once Weekend Sonnet bridge is fixed.
- Tuning tier_boundaries based on production observations.
- Evaluating `semantic_router` (embedding-based intent routing).
- Hermes auxiliary slot overrides — covered separately by AGE-12602 (Track B).
