---
name: juno-sessionkey-fix
description: "Root cause and fix for Juno's \"Adapter failed\" storm — missing sessionKeyStrategy"
metadata: 
  node_type: memory
  type: project
  originSessionId: a3952e43-1855-4d4e-8b7f-de018e6d70b0
---

Juno's adapter crashed silently ("Adapter failed", empty stderr) every time wakeOnDemand was enabled. Root cause: `runtimeConfig.sessionKeyStrategy` was `null` for Juno but `"issue"` for all working agents (Ellis, Axel, Quinn, Orion).

**Fix**: PATCH /agents/{junoId} with `runtimeConfig.sessionKeyStrategy = "issue"` using Juno's own key. No VPS shell access required.

**Why:** Missing field caused hermes adapter to fail before initialization — before config.yaml parsing, before model selection. Indistinguishable from a deep juno.sh crash.

**How to apply:** If any agent starts storming with "Adapter failed" + empty stderr after config.yaml is confirmed clean, check whether `sessionKeyStrategy` is set in their runtimeConfig. All agents should have `sessionKeyStrategy: "issue"`.

Related: [[feedback_juno_approval_mechanism]]
