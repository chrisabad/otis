---
name: ollama-cloud-tool-echo-bug
description: "Juno/Quinn echo tool results verbatim instead of acting on them — root cause is Ollama Cloud's chat-template tool-result handling on :cloud models, not the model or any proxy."
metadata: 
  node_type: memory
  type: project
  originSessionId: 252f61e3-974b-4f7d-ac3d-c1a5e64094a6
---

Symptom (AGE-295, observed 2026-06-02): Juno and Quinn (model `minimax-m2.5:cloud`) call a tool, the tool runs, then the model outputs the tool RESULT verbatim as its next turn and stops — task never completes. Seen on run 7e03eaf5 (Juno) and a concurrent Quinn run. Was ALSO seen on GLM-5.1 before the AGE-12882 model swap.

**Root cause (evidence-based, after Otis ran a real eval 2026-06-02):** NOT raw model incapability and NOT simply "template missing role:tool" (that was an early hypothesis, since disproven). A direct tool-use eval against Ollama Cloud (15 models, /api/chat + /v1, small + diff-sized results) showed **every deployed model — minimax-m2.5, minimax-m3, glm-5.1 — passes a clean round-trip.** The verbatim echo could NOT be reproduced via direct API on any model. So the production failure is the model emitting tool-call/result content as **unparsed text under the Hermes harness conditions** (prompt scaffolding/streaming), not the cloud model's raw tool handling. Failure class reproduced live: `deepseek-v3.2` emits `<function_calls><invoke ...>` XML as plain content instead of a structured call. Upstream **Ollama #16389** (OPEN, filed from a Hermes→Ollama Cloud pipeline) is specifically about **minimax-m3** (so M3 is the bug's subject, not a fix) and names **DeepSeek/Qwen as working**. Note native-provider routing is NOT an option — all inference must go via Ollama Cloud (Chris, 2026-06-02).

**Why the GLM→MiniMax swap (AGE-12882) didn't help:** both stayed in the MiniMax/GLM family that trips the Hermes-layer parsing failure; the eval also never tested a tool round-trip.

**Resolution:** fleet migrated off minimax/glm to **`qwen3-coder-next:cloud`** (fastest clean tool-caller in eval, 0.8s/1.0s; Qwen named-working in #16389). Heavy-agent alternate: `deepseek-v4-pro:cloud`. AVOID: deepseek-v3.2 (XML leak), minimax-m3 (#16389), qwen3.5 (slow ~18s on 2-step, but has vision — Vera/Orion were on it). As of 2026-06-02 no AGE agent is on minimax/glm. Eval harness: `/tmp/ollama_tooleval/eval.py`, key `agentos/ollama/key-a` (AWS SM us-east-1). Tracked in AGE-295.

**How to apply:** if an Ollama-Cloud agent silently fails on tool-using tasks, the fix surface is the Paperclip adapterConfig `model` (API PATCH, no VPS). Before blaming "the model," run the eval harness — the model usually handles tools fine in isolation; the failure is harness-level. See [[current-llm-architecture]] and [[verify-before-diagnosing]].

**AGE-325 (2026-06-03) — REFUTED report, recurring confabulation pattern.** A session claimed Axel's 401s were caused by `gpt-oss:20b` "echoing its API key, seeing `***` (Hermes masking), and aborting" — and recommended switching the light tier to glm-5.1. Three harness tests (via SSH, through the agent wrapper) refuted ALL of it: (1) `echo "${PAPERCLIP_API_KEY:0:8}"` returns the REAL key `pcp_...`, NOT `***` — Hermes does NOT mask the key in shell output here; (2) gpt-oss:20b makes the authenticated curl and gets **HTTP 200** on both Vera's and Axel's profiles; (3) Axel's key is valid (direct 200). The diagnosis was a confabulation pattern-matched to the AGE-305 `***` memory. **Lesson: a model reporting "key is masked/401" is almost always a confabulation — reproduce the actual failing run through the wrapper before switching models.** The reusable eval lives at `evals/model-bakeoff/` in the otis repo (task `t6_auth_secret` covers this); gemma4:31b and ministral-3:14b are the light models that actually FAIL auth, not gpt-oss:20b.
