---
name: feedback-no-openclaw
description: Hermes is the primary agent harness; OpenClaw is decommissioned and no longer part of AgentOS
metadata:
  type: feedback
---

Do not reference OpenClaw as an active system. Hermes is the primary agent harness.

**Why:** OpenClaw was the prior harness and has been fully decommissioned. References to it in memory/PRD files are accurate historical records and should not be edited, but any guidance or forward-looking context should use Hermes only.

**How to apply:** When reading or writing context files, config paths, and operational docs — always use `~/.hermes/...` paths, not `~/.openclaw/...`. The tracked repo list no longer includes `openclaw`, `openclaw-llm-proxy`, `.openclaw`, or `.openclaw-workspace`.
