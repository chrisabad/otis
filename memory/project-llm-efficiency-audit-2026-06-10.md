# Project: LLM Efficiency Audit (2026-06-10)

**Status:** COMPLETE — all changes applied 2026-06-10
**Trigger:** Burning through Ollama Cloud limits post-cloud-migration; prior optimization lost.

## Context: Ollama Cloud pricing is GPU-TIME based, not token based

Per https://ollama.com/pricing — usage reflects GPU time (model size × request duration).
Session limits reset every 5h, weekly limits every 7 days. Max plan = 10 concurrent cloud models.
=> Big models burn quota disproportionately. Smaller model = less GPU time per request AND less wall-clock.
Account state at audit time: "extra usage auto reload monthly max reached" — 1,521 429-rate-limit
log lines across agent logs; credential pool rotating keys just delays the wall.

## Findings (ranked by impact)

### 1. Timeout-retry storm — ~5× waste multiplier (THE acute fire)
- AGE company, 8.4h window: 500 heartbeat runs, ~90 cumulative hours, **80% FAILED with exit=124**
  (adapter timeout, `timeoutSec: 1800` in Paperclip adapterConfig).
- Paperclip heartbeat timer enqueues ~1 run / 30s; recovery loop re-enqueues failures
  (`source_scoped_recovery_action` = top wake reason) → same stuck issues retried all day,
  each retry a full glm-5.1 session burning 10+ min GPU then dying.
- Failure attribution: Juno 156/211 failed, Ellis 157/185, Axel 87/104.
- Stuck issues at audit time: maintenance-window execution (fbfd4006), Axel empty-content (9bb522ce).
- The "error" field shows Langfuse `_create_span_with_parent_context` noise — that is NOT the cause,
  it's the last stderr line. exit=124 (timeout kill) is the cause. Related: AGE-784 timeout watchdog.

### 2. AGE-295 two-tier model split LOST in cloud migration
- ALL 12 active agents (4 companies) pin `glm-5.1:cloud` (744B-class flagship) in Paperclip
  `adapterConfig.model`. The 2026-06-03 decision (HEAVY glm-5.1 = Juno/Quinn/Ellis;
  LIGHT gpt-oss:20b = Axel/Vera/Orion/Dex) survives nowhere in live config.
- Model is pinned in TWO places: Paperclip agent `adapterConfig.model` AND
  `/opt/hermes-profiles/<agent>/config.yaml model.default`. Migration carried only adapterConfig.
- Gotcha: profile default `qwen3.5:cloud` (vera/orion/diag) resolves to **qwen3.5:397b** — not light!

### 3. Auxiliary slots all on main model
- Every profile has all `auxiliary.*` slots (vision, compression, title_generation, approval,
  mcp, curator, triage_specifier, kanban_decomposer...) set `provider: main` → trivial calls
  (titles!) run on the flagship.

### 4. Context bloat / long loops
- Input:output token ratio ~200:1. ~33–43k input tokens per call. Runs reach turn 46+ (max_turns 90).
- Compression threshold 0.5 of 131k context → kicks in at ~65k. Lowering threshold/window shrinks
  every subsequent call in long runs.

## Langfuse access (works)
- Self-hosted at https://langfuse-lugt.srv1724463.hstgr.cloud
- Keys in /opt/hermes-profiles/juno/.env (HERMES_LANGFUSE_PUBLIC_KEY/SECRET_KEY)
- Useful: GET /api/public/metrics/daily; GET /api/public/metrics?query={...} (view=observations,
  dimensions providedModelName/name); traces carry agent in metadata.resourceAttributes["service.name"]
  (only since 2026-06-09; heartbeat-runner traces still unattributed = the "unknown" bulk).
- 8-day totals: glm-5.1 family 1.8B tokens / 64k calls ≈ 99% of usage. 2026-06-06 storm day:
  1.19B input tokens in one day.

## Bake-off (2026-06-10, via evals/model-bakeoff through vera wrapper on VPS)
- Candidates: nemotron-3-nano:30b, deepseek-v4-flash, gpt-oss:20b (control), ministral-3:8b, minimax-m2.5
- nemotron-3-nano:30b (3B active): t1 PASS t3 PASS t4 PASS t5 PASS t6 PASS (HTTP 200);
  t2 borderline-pass (right direction env/masking + verification cmds, but single-hypothesis).
  25–40s latencies. Strongest small-model showing yet.
- deepseek-v4-flash (284B/13B active): t1 t3 t4 t5 PASS; t2 good; t6 PASS (confirmed 2026-06-10
  fresh session via direct API — original 401 was stale resumed session context bleed, not
  self-sabotage). All 6 criteria pass. ~4x GPU time vs nemotron (13B vs 3B active) — potential
  mid-tier option if task quality warrants it.
- Note: bakeoff runs resume session 20260603_153056_695eb8 (same as prior runs — comparable, but
  consider fresh-session flag for future harness versions).

## Model research (2026-06 web)
- nemotron-3-nano:30b — NVIDIA, MoE 30B/3B-active, RL-trained for agentic tool use, 2.2× throughput
  vs gpt-oss-20b, 256k context.
- deepseek-v4-flash — 284B/13B-active MoE, SWE-bench Verified 79.0 (vs Pro 80.6), Terminal-Bench 56.9
  (vs Pro 67.9). Near-Pro coding at flash GPU cost.
- glm-5.1 — incumbent flagship; keep ONLY where interactive personality matters (Juno Slack) per Chris.

## gpt-oss:20b status (2026-06-10 retest)
- Confirmed NOT a quota failure. HTTP 200 on all endpoints, eval_count=38-48 tokens processed,
  but content/thinking both empty on OpenAI-compat, native chat, and raw generate.
  Server-side Ollama Cloud bug — model runs but produces no visible output. Skip for tiering.
  Prior AGE-295 6/6 result stands as a historical record; model is currently unusable on cloud.

## Changes applied (2026-06-10)
- [x] **Model assignments BOTH places**: nemotron-3-nano:30b for all STANDARD agents
  (Axel, Ellis, Quinn, Vera, Dex, Willa, Tess, Hollis, Nell, Morgan) in Paperclip adapterConfig +
  hermes profile config.yaml. Juno + Piper kept glm-5.1:cloud (interactive/CS).
- [x] **Aux slots**: title_generation, compression, triage_specifier, skills_hub, approval
  → provider: main, model: ministral-3:8b fleet-wide (all 14 agents)
- [x] **api_max_retries: 1** (was 3) on all agents — reduces internal retry waste per run
- [x] **Compression threshold: 0.35** (was 0.5) on all agents — triggers at ~46k ctx instead of ~65k
- [x] **Piper wrapper fixed**: added timeout 600 + --continue for chat; added /opt/hermes-wrappers/piper.sh
- [x] **Recovery loop backoff**: filed AGE-829 to Axel
- [x] **AGE-784 watchdog**: pre-existing issue confirmed in backlog (assigned Juno)
- [x] **agentos-docs model-routing.mdx**: rewritten, PR #32 open on chrisabad/agentos-docs branch llm-model-strategy
- [x] **Credential pool**: .env files for all 16 profiles swapped to chrisabad key-b (kaleidoscope maxed)

## Regression: Juno adapterConfig model (discovered 2026-06-10 ~20:00 UTC)
- **Bug**: The bulk adapterConfig update accidentally set Juno to `nemotron-3-nano:30b` instead of keeping
  `glm-5.1:cloud`. Juno's hermes profile config.yaml was correct (glm-5.1), but Paperclip's adapterConfig
  overrides the profile — so Juno ran on nemotron from ~09:14 UTC to ~20:00 UTC.
- **Symptoms**: 62 Juno runs with exit_code=124 (avg 780s), bad tool calls (missing URLs, wrong JSON, using
  bash commands as tool calls), constant tool errors. 155 total failed runs in 6h window.
- **Fix**: `UPDATE agents SET adapter_config = jsonb_set(adapter_config, '{model}', '"glm-5.1:cloud"') WHERE id = 'a38cd7bc-b6e3-47f8-a4b8-1e186d85a869'` — applied directly to DB 2026-06-10.
- **Lesson**: When doing bulk adapterConfig updates, always explicitly exclude Juno from model changes.
  Verify DB adapterConfig matches intent after any fleet-wide update.

## Open items
- [x] deepseek-v4-flash t6 retest — PASS, original failure was stale session context (not self-sabotage). All 6/6 criteria pass. Mid-tier candidate if nemotron capability proves insufficient.
- [ ] gpt-oss:20b retest when Ollama Cloud server-side bug is resolved
- [ ] PR #32 merge (agentos-docs)
- [ ] Paperclip recovery loop backoff implementation (AGE-829, assigned Axel)
