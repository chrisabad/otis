---
name: paperclip-keys-not-in-aws
description: "Paperclip API keys are NOT in AWS Secrets Manager — they're injected per-agent via Paperclip adapterConfig.env and are valid fleet-wide. A masked `***` env display can make agents confabulate false 401 blockers."
metadata: 
  node_type: memory
  type: project
  originSessionId: 252f61e3-974b-4f7d-ac3d-c1a5e64094a6
---

`PAPERCLIP_API_KEY` is **not** stored in AWS Secrets Manager. AWS SM (region us-east-1) holds only: `agentos/ollama/key-{a,c}`, `agentos/honcho/api_key`, `agentos/langfuse/{host,public-key,secret-key}`, `agentos/juno/slack_{bot,app}_token`, `agentos/{otis,axel}/github_app`, `agentos/otis/vps_ssh_key`, `agentos/zapier/credentials`. Paperclip injects each agent's `pcp_` key directly via `adapterConfig.env.PAPERCLIP_API_KEY` (type plain).

Verified 2026-06-02: all 7 AGE agents' injected keys return HTTP 200 against the API (valid, len 52, `pcp_` prefix). So AWS-sync/truncation regressions (AGE-248/256/257) cannot affect Paperclip auth.

**Gotcha:** an agent (Juno, 2026-06-02, during AGE-302) reported a 401 "masked API key `***`" blocker — but its injected key was valid (200). The `***` is a masked env *display*; the agent misread it as a broken credential and confabulated an auth-block narrative. When an agent claims its API key is broken, **test the injected key directly before believing it** — pull `adapterConfig.env.PAPERCLIP_API_KEY` and curl `/companies/<id>/issues`. Tracked in AGE-305. See [[verify-before-diagnosing]], [[current-llm-architecture]].
