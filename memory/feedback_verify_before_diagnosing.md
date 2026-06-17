---
name: verify-before-diagnosing
description: "Verify the CURRENT architecture before diagnosing — don't build a root-cause theory on stale memory/PRDs. Chris caught Otis blaming LiteLLM when LiteLLM was decommissioned."
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 252f61e3-974b-4f7d-ac3d-c1a5e64094a6
---

Before asserting a root cause, verify the system actually works the way you think it does — read current config/specs, don't lean on memory or old PRDs.

**Why:** On AGE-295 (2026-06-02) Otis built an entire root-cause analysis and fix plan around a LiteLLM → Ollama chain, citing the `memory/prds/2026-05-*-litellm-*` files. LiteLLM had been decommissioned weeks earlier (cloud migration spec v1.2). Chris: "this is not correct because we don't even use litellm. ollama cloud is integrated with hermes directly. i need you to do a better job finding the root cause." The stale PRDs read as authoritative and produced a confident, wrong answer.

**How to apply:** For any diagnosis touching infrastructure/routing/architecture, first confirm the live topology (read the latest spec, the live Paperclip adapterConfig, actual config files, pull the real package source) BEFORE forming a theory. Treat dated PRDs/memories as "true at time of writing," not current. When a memory names a specific component (a proxy, a file, a service), check it still exists in the live path before reasoning from it. See [[current-llm-architecture]].
