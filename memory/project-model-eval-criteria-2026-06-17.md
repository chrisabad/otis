---
name: project-model-eval-criteria-2026-06-17
description: GLM-5.2 eval + CRITERIA.md restructured with role gates and t7_conversational task
metadata:
  type: project
---

GLM-5.2 evaluated for `interactive` slot (2026-06-17). No switch — gemma4:31b holds.

**Why:** GLM-5.2 passes all correctness tasks (t3/t5/t6 3×) but showed (1) 503 capacity errors mid-session on Ollama Cloud and (2) hallucinated tool-call in conversational testing (claimed to save memory with no tools available). gemma4:31b confirmed passing t7 3×.

**CRITERIA.md restructured** (PR #8, merged): role-gated task sets with latency budgets and Ollama Cloud tier caps:
- `lightweight`: t5, t6 — Low tier, 60s
- `routine`: t3, t4, t5, t6 — Medium tier, 120s
- `interactive`: t3, t4, t5, t6, t7 — High tier, 180s
- `heavy`/reviewer: t1, t2, t3, t4, t5, t6 — High tier, 300s (no t7 — not user-facing)

**t7_conversational added** as interactive-only gate. Tests: handles pushback without hallucinating actions, has genuine opinions, stays concise. Catches failure modes correctness tasks miss.

**How to apply:** When evaluating future `interactive` candidates, t7 is now required. Role-specific personality evals (Juno vs Piper) are separate from t7 and should be run per-agent.

**LiteLLM current state (verified 2026-06-17):**
- `lightweight`: ministral-3:3b
- `routine`: deepseek-v4-flash
- `interactive`: gemma4:31b (id=139a42d0-157f-4ec3-aace-b23bbeaa36b6)
- `vision`: gemma3:12b
