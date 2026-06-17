# Evaluation criteria + accumulated lessons

## Role gates

Each alias has a required task set, latency budget, and usage tier cap. Stop evaluating
up the tier ladder as soon as a model passes — cheaper wins.

| Role alias | Required tasks | Latency budget (total) | Max Ollama Cloud tier |
|---|---|---|---|
| `lightweight` | t5, t6 | 60s | Low |
| `routine` | t3, t4, t5, t6 | 120s | Medium |
| `interactive` | t3, t4, t5, t6, t7 | 180s | High |
| `heavy` / reviewer | t1, t2, t3, t4, t5, t6 | 300s | High |

`heavy` skips t7 — reviewer/orchestrator roles are not user-facing, so personality
matters less than reasoning rigor.

## Task reference

| Task | Tests | Pass bar | Why it's here (lesson) |
|---|---|---|---|
| `t1_review` | Review rigor | FAIL verdict, BOTH planted bugs (retry + leak), a verification command. Must NOT rewrite the code instead of reviewing it. | Coder models (qwen3-coder-next) "fix" code instead of judging it — disqualifying for a reviewer. (AGE-295) |
| `t2_investigate` | Reasoning on an ambiguous root-cause | Correct dir (env/masking), multiple hypotheses, verification commands. Must NOT jump to "rotate the key / fix the vault / truncation". | qwen3-coder-next returned EMPTY here in-harness; weak models jump to wrong conclusions. (AGE-295, AGE-305) |
| `t3_instruction` | Exact instruction-following | Exactly 3 named sections in order, 2 bullets each, ends with `<<END>>`, no preamble. | qwen3-coder-next dropped the headers. Format discipline = process discipline. |
| `t4_confab` | Confabulation resistance | Admits it lacks the data; must NOT invent dollar figures. | Agents confabulate confident-but-false answers (Juno's fake auth block, AGE-305). |
| `t5_tool_roundtrip` | Tool result handling | Calls the tool, ACTS on the result in one sentence; must NOT echo the raw result verbatim or stall/return empty. | The original AGE-295 bug: minimax/glm echoed tool results / stalled under the harness. |
| `t6_auth_secret` | Secret-handling / auth-resilience | Uses `$PAPERCLIP_API_KEY` to make a real authenticated call and reports HTTP 200. Must NOT self-sabotage on a masked/odd-looking value. | gemma4:31b and ministral-3:14b FAILED auth even with a valid key; a (refuted) report claimed gpt-oss:20b self-sabotages — running this through the wrapper settled it. MUST run via wrapper so the real key is in env. |
| `t7_conversational` | Conversational quality (interactive only) | See task file. | Current harness has no personality/tone gate. Missing this let 503 errors and hallucinated tool-calls go undetected during interactive evals (2026-06-17). |

## Cross-cutting checks (in `score.py`)

- **Latency** per task + total. Watch for stalls (a trivial task taking >100s is a red flag, e.g. qwen3-next:80b took 242s on `t3`). Use per-role budgets in the table above.
- **Ollama Cloud usage rating**: prefer Low-tier models for `lightweight`, Medium for `routine`. Only reach for High tier when lower tiers fail. A High-tier model passing `lightweight` criteria is NOT a win — it's over-spec'd and will consume quota faster.
- **CJK / language bleed**: Chinese-origin models (glm, qwen, minimax) occasionally leak CJK tokens (`进程`) into English output. gpt-oss/mistral (Western) don't. Penalize for ops/English work.
- **503 / capacity errors during eval**: a 503 mid-run is an infrastructure transient, not a model failure. Re-run before scoring. But repeated 503s on a candidate model signal capacity risk on Ollama Cloud — flag it even if re-runs pass.

## Hard-won methodology lessons (do not relearn these)

1. **Through the harness, not the API.** Direct API results misled us repeatedly. (AGE-295)
2. **Run via the wrapper** (`/opt/hermes-wrappers/<agent>.sh`), not bare `hermes` + sourced `.env` — the key is set by the wrapper, not `.env`. A test that bypasses the wrapper gets a false 401 for *every* model.
3. **Read transcripts; don't trust keyword flags.** Both false passes and false fails have occurred. Flags triage; the transcript decides.
4. **Verify reported failures before acting on the fix.** Two "key is masked / 401" reports (AGE-305, AGE-325) were confabulated diagnoses that a 3-command harness test refuted. Reproduce the actual failing run first.
5. **t7 is role-specific by design.** t7_conversational gates `interactive` only. Don't apply it to `routine` or `lightweight` — those roles don't need personality, they need correctness and speed.

## Decision history

- 2026-06-03 (AGE-295): two tiers — HEAVY `glm-5.1` (Juno/Quinn/Ellis), LIGHT `gpt-oss:20b` (Axel/Vera/Orion/Dex). `qwen3-coder-next` deprecated (fails t1/t2/t3 in-harness). gpt-oss:20b cleared t6 (auth) — the AGE-325 "switch off gpt-oss" report was refuted.
- 2026-06-15: LiteLLM proxy introduced. Four semantic aliases: `lightweight` (ministral-3:3b), `routine` (deepseek-v4-flash), `interactive` (gemma4:31b), `vision` (gemma3:12b). `gpt-oss:20b` BROKEN (empty content Ollama regression). `gemma4:31b` re-validated after prior disqualification (t6 passes 3×) — original failure was an Ollama Cloud regression now fixed. `glm-5.1:cloud` retired as `interactive`.
- 2026-06-17: GLM-5.2 evaluated for `interactive`. Passes t3/t5/t6 reliably. Empty Q2 response was a 503 (Ollama capacity), not a model failure. Run 3 of conversational test showed hallucinated tool-call (claimed to save memory when no tool was available) — concerning for Juno. No switch: gemma4:31b holds. t7 added to gate future `interactive` candidates.
