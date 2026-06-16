---
name: agentos-slack-smoke-test
description: Smoke-test Slack roundtrip across AgentOS workspaces — synthesize a Slack webhook event, POST it to the gateway with valid signing, observe Juno's outbound response, and time the full inbound→outbound flow. Use when verifying Slack pipelines after gateway/policy-plugin/Slack-account/Juno changes, when investigating why Slack DMs aren't getting answered, or as a periodic health check on the message-handling chain. Roster is the 2 Slack workspaces (Kaleidoscope and Weekend); Juno is the only agent that posts to Slack per AGE-3497.
version: 1.0.0
audience: shared
---
# AgentOS Slack Smoke Test

End-to-end roundtrip test of the Slack inbound→outbound flow per workspace. Sends a synthetic `event_callback` webhook to the gateway, waits for Juno's response to land, and times the whole thing.

## When to use

- After gateway restart, policy-plugin deploy, or Juno config change (verify the Slack chain still works).
- After Hermes migration (AGE-12104) ships — current Juno-on-Hermes setup makes all Slack responses fail per AGE-12104, so this test will be more useful post-migration.
- Investigating "why did Slack DMs to Juno stop working?" — surfaces where in the chain the failure is.
- Periodic ops health check — alongside `agentos-smoke-test` for heartbeats.

## Roster (2 workspaces)

| Workspace | Account ID | Webhook Path | Bot |
|---|---|---|---|
| Kaleidoscope | `kaleidoscope` | `/slack/events/kaleidoscope` | Juno |
| Weekend | `weekend` | `/slack/events/weekend` | Juno |

Per `project_slack_juno_only`, only Juno posts to Slack — so the responder is always Juno-per-workspace. No other agents in scope.

## How it works (per workspace)

1. **Synthesize webhook** — build an `event_callback` payload simulating a DM to Juno. Unique `event_id` and `event_ts` per run to avoid Slack dedup.
2. **Sign** — HMAC-SHA256 of `v0:<unix-ts>:<body>` with the workspace's `signingSecret` (read from `~/.hermes/auth.json` or `~/.hermes/config.yaml`). Set headers: `X-Slack-Request-Timestamp`, `X-Slack-Signature: v0=<hex>`.
3. **POST** to `http://127.0.0.1:18790<webhookPath>`. Capture inbound timing.
4. **Observe outbound** — tail Juno's `~/.hermes/agents/<juno-id>/sessions/*.jsonl` for an outbound `message:sent` event with our event_id correlation, OR poll Slack `chat.history` on the test channel using the workspace's `botToken` and look for a new bot message in the last N seconds.
5. **Time + report** — wall-time `[POST sent → outbound observed]`, plus per-phase breakdown from Langfuse (post-AGE-12305/12310 deploy: webhook handler, policy plugin, agent run, outbound dispatch).

## Usage

```bash
~/.claude/skills/agentos-slack-smoke-test/scripts/slack-smoke.py [flags]
```

Common invocations:

```bash
# Smoke both workspaces, 8s stagger, sequential
slack-smoke.py

# Just Kaleidoscope
slack-smoke.py -W kaleidoscope

# Dry-run — synthesize and sign payload, print, don't POST
slack-smoke.py --dry-run

# Custom message text (default: "[smoke-test] ping <run-id>")
slack-smoke.py --text "test from smoke"

# Per-roundtrip timeout (default 60s — Juno parked under AGE-12104, so most runs time out)
slack-smoke.py --timeout 30
```

## Caveats

- **Currently fails under AGE-12104**: Junos are parked pending Hermes migration. Inbound webhook + policy plugin + agent dispatch still works (and we surface that timing); the response-generation step times out. After Hermes lands, this test should pass cleanly.
- **Test channel selection**: by default routes to a dedicated `#smoke-test` channel per workspace (configured in the script). Falls back to the agent's known DM channel ID if `#smoke-test` isn't configured. **Never** routes to public conversation channels — explicit allowlist only.
- **Slack dedup**: every run uses a fresh `event_id` (UUID4) and `event_ts` (current ts). Same dedup window as Slack's own; smoke runs minutes apart are safe.
- **Outbound observation**: prefers `delivery-mirror` session log (hermetic, fast) over `chat.history` polling (rate-limited, slower, requires bot token). Falls back automatically.
- **Trace correlation**: post-deploy of AGE-12310 (LiteLLM proxy paperclipRunId injection), Langfuse traces will be tagged with the workspace + smoke-run ID for exact phase breakdown. Pre-deploy, falls back to time-window correlation against the gateway's hook handler trace.

## Trace breakdown (post-deploy)

```
PASS  kaleidoscope (run abc123) — 4.2s total: webhook 12ms · policy 38ms · llm 3.6s · outbound 410ms · other 142ms
```

Phases:
- `webhook` — gateway hook handler (verify signature, parse, route)
- `policy` — kaleidoscope-policy plugin (broker check, suppression rules)
- `llm` — Juno's LLM call(s) for response generation
- `outbound` — `chat.postMessage` API call to Slack
- `other` — gap / framework overhead
