# LLM Cost Discipline — Weekend exposure to $150/mo cap

**Author:** Otis (COO, AGE)
**Date:** 2026-05-09
**Status:** Draft, pending peer review (Quinn → Ellis)
**Linked AGE issue:** TBD on filing

## Objective

Bring AgentOS LLM spend on Weekend-sponsored accounts (Anthropic + Gemini) from ~$833/mo to ≤ $150/mo within 30 days, without breaking agent functionality. Restore honest per-business cost attribution so unit economics for Kaleidoscope / AGE / FontReplacer reflect true infrastructure costs.

## Background

Anthropic policy change: subscription plans no longer apply to 3rd-party harnesses; harness usage is billed at API rates. Chris cancelled Kaleidoscope and Personal Anthropic accounts; only the Weekend Anthropic account remains as the Anthropic provider for the fleet. Weekend also sponsors the Gemini API key currently in active use via `GEMINI_API_KEY_WEEKEND` (post-Phase-2; presently `GEMINI_API_KEY` (Chris personal) is wired in).

30-day diagnostic (LiteLLM `LiteLLM_DailyUserSpend` joined with `LiteLLM_VerificationToken`):

| Provider | Current $30d | Billed to | Post-Phase-2 destination |
|---|---:|---|---|
| Anthropic (weekend-*) | $358 | Weekend | Weekend (in cap) |
| Gemini (all 9 routes) | $454 | Personal (today) | Weekend (in cap, after key swap) |
| xAI grok | $21 (historical, now $0) | KALEIDOSCOPE | $0 — routes removed |
| Ollama Cloud | flat-rate sub | Personal sub | Personal sub (out of cap) |
| **Total Weekend exposure (post-Phase-2)** | **~$833** | | **target ≤ $150** |

### Orphan key (root-cause finding)

A single hardcoded Juno-prefixed token `sk-juno-e2447bf1f0768e293f90d4071916f9457b5cfb5f36204516` (sha256 hash `d47c063a9c6be046d5df9ef4844998435a3585850b34e0c942c1e8707850c615`) is wired into the `adapterConfig.env.LITELLM_API_KEY` field of at least 12 Paperclip agent records (vera, fen, reed, sage, willa, fon-reviewer, cass, arlo, piper, stu-reviewer, rue, and probably others). The token is not in `LiteLLM_VerificationToken` — it's an orphaned token whose record was deleted but whose plaintext lives on in agent adapter configs. All those agents' LiteLLM calls coalesce onto this orphan, which is responsible for:

- $179/mo gemini-flash (25k requests)
- $97/mo gemini-pro (4.3k requests)
- $87/mo weekend-haiku (3.5k requests)
- $50/mo weekend-sonnet (556 requests)
- 62k Ollama Cloud requests/mo (subscription, no $)

= **$413/mo of LLM spend with no per-agent attribution**, of which ~$316/mo is Weekend-billed.

Fixing this single key (re-attribute each agent's adapter to its own LiteLLM key) restores per-agent visibility AND enables per-agent budget caps.

### Architectural note on alias escalation

Most agent Hermes profiles already default to `routine` (Gemini-backed); only Juno defaults to `pro` (Anthropic-backed). The Anthropic spend is therefore not coming from agent default models — it comes from **alias escalation** within agent runs (auxiliary calls, skill-driven escalations, code-gen via `code` alias, writing skills calling `writing-claude-opus`, etc.). The fix is at the LiteLLM alias-mapping layer, not at the per-agent profile layer.

## Principle

External-facing writing (LinkedIn / Substack) is the only Anthropic-justified use case. Everything else routes Ollama-Cloud-first, Gemini-fallback, with Anthropic removed from the chain.

## Tier ladder

| Tier | Backend | Use for | Counts toward $150 cap? |
|---|---|---|---|
| 0 — Default | Ollama Cloud (glm-5.1, gemma4:31b, qwen3-coder) | Heartbeats, classification, summarization, log triage, simple agent loops | No (subscription) |
| 1 — Step up | Gemini Flash | When Ollama insufficient | Yes |
| 2 — Hard reasoning | Gemini Pro | Complex code, peer review | Yes |
| 3 — External writing | Anthropic Opus / Sonnet | LinkedIn, Substack, public-facing only | Yes |

Target allocation within $150 cap: Anthropic ≤ $50, Gemini Pro ≤ $40, Gemini Flash ≤ $30, buffer $30.

## Phases

### Phase 1 — Visibility (mostly done)
- ✅ Diagnostic run, baseline established
- ✅ Cancelled Anthropic routes confirmed dead (no urgent op issue)
- ✅ Orphan key identified (`sk-juno-e244…`, in 12+ agent adapter configs)
- ✅ Gemini key split confirmed (LiteLLM uses unsuffixed = personal; `_WEEKEND` exists but unwired)
- ✅ xAI grok routes removed from LiteLLM config (verified 2026-05-10). Was wired 2026-04-18 as `pro-grok`, `fast-grok`, `routine-grok`, `routine-code-grok`, `writing-grok`, `code-grok`, `frontier-writing-grok` — all gone in current config. **Card source: KALEIDOSCOPE** (chris@kaleidoscope.studio xAI account, confirmed via console.x.ai screenshots 2026-05-10; weekend.com and chrisabad@gmail.com have no xAI keys). Two keys still live on that account: `xai-...o6bP` ("AgentOS") in `~/.litellm/.env`, used by `scripts/betterstack-connectivity-check.sh` for free `/v1/models` uptime probe (non-billable); `xai-...buG7` ("Juno") in `~/.hermes/profiles/{juno,sage}/.env`, no active consumer detected. Historical $21/mo was Kaleidoscope-billed via the now-removed grok routes; ongoing exposure ~$0.

### Phase 2 — Routing changes (~2-3 days, requires peer review)
- Switch all 9 Gemini routes in `~/.litellm/config.yaml` from `os.environ/GEMINI_API_KEY` to `os.environ/GEMINI_API_KEY_WEEKEND`
- Remove dead `kaleidoscope-*` and `personal-*` routes from LiteLLM config
- Remap aliases `routine`, `fast`, `pro`, `code` to Ollama-Cloud-first chains, Gemini-fallback only, Anthropic removed
- Reserve `writing-*`, `frontier-writing-*` aliases on Anthropic-backed routes
- Re-attribute each Paperclip agent adapter from `sk-juno-e244…` to that agent's own LiteLLM API key (PATCH on each agent record's `adapterConfig.env.LITELLM_API_KEY`)
- Delete the orphan token plaintext from disk

### Phase 3 — Budget guardrails (~1 day)
- LiteLLM team budget: $150/mo on Weekend keys (combined Anthropic + Gemini after Phase 2 swap)
- Sub-budgets: Anthropic-aliases $50/mo, Gemini-aliases $100/mo
- Slack alert at 80% utilization (#agent-ops or #money — TBD with Chris)
- Hard-fail at 100% (forces investigation rather than silent overage)

### Phase 4 — Verification & ongoing reporting
- Re-run today's diagnostic at +30 days. Pass = Weekend LLM spend ≤ $150
- Monthly per-business cost report from Otis: spend by company / agent, trend vs prior month, Weekend cross-subsidy used vs cap, implied gross margin
- First report 2026-06-09, then monthly

## Success Criteria (acceptance criteria on parent issue)

- [ ] Phase 2 LiteLLM config changes merged via Quinn → Ellis review
- [ ] Orphan `sk-juno-e244…` token no longer present in any Paperclip agent adapter config (`grep -r 'sk-juno-e2447bf1' ~/.paperclip ~/repos/paperclip` returns empty)
- [ ] LiteLLM team budget cap of $150/mo configured against Weekend-keyed routes
- [ ] Slack alert configured at 80% utilization
- [ ] At +30 days: re-run diagnostic shows Weekend LLM spend ≤ $150
- [ ] Monthly per-business cost report delivered by Otis (first by 2026-06-09)

## Risks

- **Quality regression** if Ollama Cloud insufficient for tasks currently using Gemini Flash. **Mitigation:** Phase 2 includes per-alias smoke test before final cutover; quality-fail rolls back to Gemini-fallback automatically.
- **Lost work / silent failures** if hard cap fires mid-run. **Mitigation:** alert at 80% gives 12+ hours of warning before hard-fail.
- **Re-attribution side effects** — some agents may have permissions tied to the orphan key. **Mitigation:** each adapter swap is a single PATCH; smoke-test per agent post-swap.
- **Anthropic-only edge cases**: peer-review work (Quinn) and complex Slack-facing decisions (Juno advisory) may degrade in quality on Gemini Pro. **Mitigation:** Quinn and Juno keep `pro-claude` / `frontier-reasoning-claude` aliases callable as explicit opt-in for declared high-value calls; their *default* tier moves to Gemini.

## Out of scope

- Opening new Anthropic accounts for Kaleidoscope or other businesses (explicitly cancelled per Chris)
- Hardware investments (Mac Studio decision: cancelled)
- xAI grok billing-source split (informational only, single sub-issue)
- Personal Gemini usage for embeddings — stays as-is

## Phase rollout sub-issues (to be filed once parent reviewed)

1. `[Otis] Verify xAI grok billing source` (low — informational)
2. `[Axel] LiteLLM config: switch Gemini routes to GEMINI_API_KEY_WEEKEND` (high)
3. `[Axel] LiteLLM config: drop dead kaleidoscope-* and personal-* routes` (medium)
4. `[Axel] LiteLLM config: remap routine/fast/pro/code aliases to Ollama-first chains` (high)
5. `[Otis] Re-attribute Paperclip agent adapters off orphan sk-juno key` (high — requires touching ~12+ agent records via Paperclip API)
6. `[Axel] LiteLLM team budget: $150/mo cap on Weekend-keyed routes + Slack alert at 80%` (high)
7. `[Otis] Phase 4 verification + monthly per-business cost report scheduling` (medium)

Each sub-issue will follow the standard QA workflow (in_review → Quinn verification → done).
