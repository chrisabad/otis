---
name: project-juno-slack-tokens
description: "Juno's Slack tokens — where they live, how they were lost, and how to restore"
metadata: 
  node_type: memory
  type: project
  originSessionId: 02b0399e-daca-4a4d-8e5a-d394537947b2
---

Juno's Slack bot/app tokens are now durably stored in AWS Secrets Manager:
- `agentos/juno/slack_bot_token` (xoxb-)
- `agentos/juno/slack_app_token` (xapp-)

They must also be present in `/opt/hermes-profiles/juno/.env` on the VPS for the gateway to use them. The `platforms.slack.enabled` flag in `config.yaml` must also be `true`.

**Why:** Tokens were lost on 2026-05-30 04:09 when hermes auto-updated its systemd service definition and restarted the gateway. The original gateway had been started manually with real tokens in the shell env — they were never durably written to `.env`. The `.env` always had `***` placeholders. AWS SM had no Slack secrets either.

**Open ticket:** There's an open ticket to auto-sync secrets from AWS Secrets Manager into agent `.env` files. Juno's tokens are the first real test case for that flow. Until the sync is wired up, any gateway restart that doesn't source the `.env` correctly will break Slack again.

**How to apply:** If Juno's Slack goes dark again, check `platforms.slack.enabled` in config.yaml (must be `true`) and verify `.env` has real tokens (not `***`). Source from AWS SM if needed.
