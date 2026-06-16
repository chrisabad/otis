---
name: agent-onboarding
description: Scaffold and configure a new agent in the Kaleidoscope multi-agent workspace. Use when Chris asks to create a new agent, add a new specialist to the team, or onboard a new AI role. Covers SOUL.md, AGENTS.md, PaperClip registration, Slack account config, gateway binding, and mentionPatterns. Also use when auditing an existing agent for missing setup elements.
version: 1.0.0
audience: shared
---
# Agent Onboarding

Scaffolds a fully configured agent: persona files, coordination rules, PaperClip registration, Slack config, and gateway binding.

## What this skill creates

1. Agent workspace at `~/.hermes/profiles/<name>/`
2. `SOUL.md` — persona, notification tiers, data confidentiality, coordination rules
3. `AGENTS.md` — startup sequence, task recovery, completion protocol
4. PaperClip agent registration under the correct company
5. `config.yaml` patch — agents.list entry + Slack account + binding + mentionPatterns
6. Channel ownership entry in all agents' `SOUL.md` coordination section

## Step 1 — Gather inputs

Ask Chris for (or infer from context):
- **Agent name** (e.g., "Wren")
- **Role / title** (e.g., "Head of Growth for Font Replacer")
- **Domain** — what this agent owns exclusively
- **Primary Slack channel** — the one channel this agent posts to
- **PaperClip company** — which company (FON / KAL / PIX / DIA / WEE) this agent belongs to
- **Model preference** — default `anthropic/claude-haiku-4-5` for lightweight; `anthropic/claude-sonnet-4-6` for complex reasoning

## Step 2 — Create workspace files

```bash
mkdir -p ~/.hermes/profiles/<name>
```

Write `SOUL.md` using the template at `references/soul-template.md`.
Write `AGENTS.md` using the template at `references/agents-template.md`.

Both files require:
- Agent name and role filled in throughout
- Channel ownership map updated with the new agent's channel
- Notification batching tiers populated
- PaperClip issue IDs added once registration is complete (Step 3)

## Step 3 — Register in PaperClip

```bash
PAPERCLIP_API_KEY=<company-juno-key> npx --yes paperclip-ai@0.3.1 \
  agent create \
  --name "<Name>" \
  --role "<Role>" \
  --company-id <company-id>
```

Company IDs and Juno keys are in `memory/paperclip-setup.md`.

Capture the returned `agent_id` and `api_key`. Store them in `memory/paperclip-setup.md` under the correct company section.

### ⚠️ Required: Set sessionKeyStrategy after registration

After registering, **immediately patch the agent's `adapterConfig`** with the correct session key settings. Without this, the Hermes gateway will reject all wake invocations with `INVALID_REQUEST: agent "X" does not match session key agent "main"`.

```bash
JUNO_KEY=$(grep "PAPERCLIP_API_KEY" ~/.hermes/.env | head -1 | cut -d= -f2)
AGENT_PAPERCLIP_ID=<uuid-returned-from-create>
HERMES_AGENT_ID=<hermes-agent-id>  # e.g. "axel", "marlowe", "main"
COMPANY_ABR=<company-abbreviation>     # e.g. "age", "wee"

# Generate a stable Ed25519 device key (must be done once per agent)
DEVICE_KEY=$(openssl genpkey -algorithm ed25519 2>/dev/null)

curl -s -X PATCH "http://127.0.0.1:3101/api/agents/$AGENT_PAPERCLIP_ID" \
  -H "Authorization: Bearer $JUNO_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"adapterConfig\": {
      \"url\": \"ws://127.0.0.1:18790\",
      \"agentId\": \"$HERMES_AGENT_ID\",
      \"authToken\": \"$(grep 'gateway.*auth.*token\|auth.*token' ~/.hermes/config.yaml | head -1 | grep -o '[a-f0-9]\{40,\}')\",
      \"sessionKeyStrategy\": \"run\",
      \"sessionKey\": \"agent:$HERMES_AGENT_ID:$COMPANY_ABR:paperclip\",
      \"payloadTemplate\": {\"agentId\": \"$HERMES_AGENT_ID\"},
      \"devicePrivateKeyPem\": $(echo "$DEVICE_KEY" | python3 -c \"import sys,json; print(json.dumps(sys.stdin.read()))\")
    }
  }"
```

> **⚠️ Required: `devicePrivateKeyPem`** — Without this field, each run generates a **new random device fingerprint** that lands in the pending approval queue. This means every single run requires manual `hermes devices approve` before it can execute. With a stable Ed25519 key, the device fingerprint is deterministic — approve it once after onboarding and all future runs proceed without intervention.
>
> The `payloadTemplate.agentId` must match the Hermes process name (`agentId` field). For Juno/orchestrators that run as the "main" process, use `"agentId": "main"`.

**Why this is required:**
- The Hermes gateway validates that the `agentId` in every WS request matches the agent embedded in the `sessionKey`
- The PaperClip hermes_local adapter defaults `sessionKeyStrategy` to `"issue"` — which builds `paperclip:issue:<id>` using whatever issue was in context, typically encoding the `main` agent
- Without `sessionKeyStrategy: "fixed"` and a correctly-scoped `sessionKey`, every drain-loop invocation fails
- The correct session key format is `agent:<hermes-agent-id>:paperclip` (all lowercase)

## Step 4 — Create the Slack bot

This is a manual step Chris must do (requires Slack app dashboard access):
1. Go to api.slack.com/apps → create new app from scratch
2. Enable the bot, copy Bot Token (`xoxb-...`) and Signing Secret
3. Set webhook path to `/slack/events/<name>` (lowercase)
4. Subscribe bot events: `app_mention`, `message.channels`, `message.groups`
5. Install to workspace

Provide Chris the exact config block to paste (see Step 5).

## Step 5 — Patch config.yaml

**Always follow the Config Change Protocol** (AGENTS.md P_CONFIG): backup → validate → patch → smoke test.

```bash
cp ~/.hermes/config.yaml ~/.hermes/config.yaml.bak-$(date +%Y%m%d-%H%M%S)
```

Use `gateway config.patch` with:

```json5
{
  agents: {
    list: [
      {
        id: "<name>",
        name: "<Name>",
        workspace: "/home/hermes/.hermes/workspace/agents/<name>",
        agentDir: "/home/hermes/.hermes/agents/<name>",
        model: "<model>",
        skills: [],
        memorySearch: { enabled: false },
        identity: { name: "<Name>" },
        groupChat: {
          mentionPatterns: ["@?<Name>", "@?<name>"]
        },
        tools: {
          allow: ["exec", "message", "web_fetch", "Read", "Write"],
          exec: {
            security: "allowlist",
            safeBins: ["curl", "python3", "bash", "sh"]
          },
          fs: { workspaceOnly: true }
        }
      }
    ]
  },
  channels: {
    slack: {
      accounts: {
        "<name>": {
          name: "<Name>",
          mode: "http",
          signingSecret: "<signing-secret>",
          webhookPath: "/slack/events/<name>",
          enabled: true,
          botToken: "<bot-token>",
          userTokenReadOnly: true,
          allowBots: true,
          groupPolicy: "open",
          streaming: "partial",
          nativeStreaming: true,
          requireMention: false,       // ⚠️ NEVER set to true — see routing policy
          defaultTo: "<primary-channel-id>",
          channels: {
            "<primary-channel-id>": {} // empty — no requireMention override here
          }
        }
      }
    }
  },
  bindings: [
    {
      agentId: "<name>",
      match: { channel: "slack", accountId: "<name>" }
    }
  ]
}
```

⚠️ **Routing policy (non-negotiable):**
- `requireMention: false` at the global level — agents must see all messages in their channels to evaluate domain fit
- Channel entries (`channels.<id>`) must be **empty `{}`** — no `requireMention` override
- Domain filtering is SOUL.md's job, not config's job
- See `memory/agent-routing-policy.md` for full rationale

The ONLY valid override in a channel entry is `tools: { deny: [...] }` (e.g., observe-only channels).

## Step 6 — Update channel ownership map in all SOUL.md files

Add the new agent's channel to the `### Channel ownership map` section in every existing agent's SOUL.md, and in the new agent's own SOUL.md.

```bash
# Files to update:
~/.hermes/SOUL.md
~/.hermes/profiles/*/SOUL.md
```

The map entry format:
```
- <Name> → #<channel> (<domain description>)
```

## Step 7 — Smoke test

After gateway restart (~90 sec):
- Post a message in the agent's primary channel that @mentions them by name
- Confirm they reply; confirm no other agent fires

## ✅ Onboarding Completion Checklist

Before marking any agent as fully onboarded, **all 6 gates must pass — in order**. This checklist was derived from a 2026-03-28 audit of the full fleet and updated 2026-03-29 after Axel's key gap was discovered.

| # | Gate | How to verify | Common failure mode |
|---|------|---------------|---------------------|
| 1 | `SOUL.md` — substantive (>100 bytes, not a stub) | `wc -c ~/.hermes/profiles/<name>/SOUL.md` | File exists but contains placeholder text |
| 2 | `AGENTS.md` — present with session startup protocol | `ls ~/.hermes/profiles/<name>/AGENTS.md` | Missing entirely; agent has no session protocol |
| 3 | `.env` — present with all required API keys | `cat ~/.hermes/profiles/<name>/.env` | New agents scaffolded without any credentials |
| 4 | PaperClip agent record in correct company — **registered AND API key issued and in `.env`** | `curl http://127.0.0.1:3101/api/companies/<id>/agents` + verify key in `.env` works | **Most commonly missed.** Agent registered but key never issued, or key listed as "TBD" and never followed up. Key must be tested with a live API call before this gate passes. |
| 5 | PaperClip key smoke test — verify the key actually authenticates | `curl -s "http://127.0.0.1:3101/api/companies/<id>/issues" -H "Authorization: Bearer <key>"` — must return issues list, not 403/404 | Key in `.env` but expired, wrong company scope, or never patched into agent record |
| 6 | **`devicePrivateKeyPem` in `adapterConfig`** — stable device fingerprint set | `curl .../api/agents/<id>` and confirm `adapterConfig.devicePrivateKeyPem` is present | **Commonly missed for agents created outside normal onboarding flow.** Without it, every run generates a new device that lands in pending approval — the agent can never run autonomously. After setting, trigger one wakeup, approve the single pending device (`hermes devices approve <id>`), and verify subsequent wakeups need no approval. |
| 7 | Slack account in `config.yaml` (or explicitly documented as headless) | Check `agents.list` + `channels.slack.accounts` in config | Agent is "headless by design" — must be documented explicitly in AGENTS.md if intentional |

**All 7 must pass. Partial onboarding = not onboarded.**

⚠️ **Gate 4+5 are atomic — do not mark onboarding complete if the key is "pending", "TBD", or untested.** If a key cannot be issued immediately (e.g., pending board approval), the AGE issue tracking the onboarding must remain `in_progress`, not `done`.

If an agent is intentionally headless (no Slack account, no PaperClip), document this explicitly in their `AGENTS.md` under a `## Headless Configuration` section explaining why.

### Fleet audit command

To check all agents at once:

```bash
for agent_dir in ~/.hermes/profiles/*/; do
  name=$(basename "$agent_dir")
  soul=$([ -s "$agent_dir/SOUL.md" ] && wc -c < "$agent_dir/SOUL.md" || echo 0)
  agents_md=$([ -f "$agent_dir/AGENTS.md" ] && echo "✓" || echo "✗")
  env_file=$([ -f "$agent_dir/.env" ] && echo "✓" || echo "✗")
  echo "$name | SOUL.md: ${soul}B | AGENTS.md: $agents_md | .env: $env_file"
done
```

PaperClip and Slack registration require manual cross-reference against `memory/paperclip-setup.md` and `config.yaml`.

## Reference files

- `references/soul-template.md` — full SOUL.md template with all required sections
- `references/agents-template.md` — full AGENTS.md template
- `references/coordination-rules.md` — the canonical multi-agent coordination section (verbatim copy for SOUL.md)
- `references/paperclip-setup.md` — pointer to live PaperClip config (do not duplicate; read from `memory/paperclip-setup.md`)
