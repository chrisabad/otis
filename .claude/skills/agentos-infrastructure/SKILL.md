---
name: agentos-infrastructure
description: |
  Orientation layer for all AGE fleet infrastructure work. Covers VPS layout,
  Paperclip API, agent dispatch, plugin routing, repos, and which path to take
  for any change. Load this before any fleet/infra task.
  Triggers: "agentos-infrastructure", "fleet infra", "infrastructure skill",
  "where does X live", "how do I change Y", any VPS/Paperclip/agent-profile work.
---

# AgentOS Infrastructure — Orientation Map

Load this before any fleet work. It is the mental map for "where is X?" and
"how do I change Y?" — detailed runbook is in HEARTBEAT.md.

## Paperclip API

- **Endpoint**: `https://paperclip-ezk7.srv1710374.hstgr.cloud/api`
- **Auth**: `Authorization: Bearer $PAPERCLIP_BOARD_KEY_CLOUD` (board key covers all companies)
- **Credentials**: `source ~/.hermes/workspace/agents/otis/.env` on local; already in env on cloud

Company IDs:
| Company | ID |
|---|---|
| AGE | `f4593f38-24c0-481c-9771-3c52e74d16f5` |
| FON | `029fb83c-3204-4fef-a90c-85a8e89ca49d` |
| PER | `39dc3585-54f1-4543-904e-e95d1fd9395a` |
| KAL | `24b4c1e0-5bc5-46bd-a391-a014ee42cab8` |

AGE agent IDs:
| Agent | ID | Role |
|---|---|---|
| Juno | `a38cd7bc-b6e3-477f-a4b8-1e186d85a869` | ceo / orchestrator |
| Axel | `a83301c2-21bc-4e77-bdbc-71900cb46387` | cto / implementer |
| Ellis | `a3e4c733-5834-40b9-aea2-4ec0d0146772` | qa / reviewer + approver |
| Quinn | `67f1e093-3020-488a-ad18-cbe6658376ea` | qa (error state — do not use) |

FON agent IDs:
| Agent | ID | Role |
|---|---|---|
| Juno (FON) | `16adddf5-9b3c-4cea-8913-7ec8213b7a9a` | ceo / orchestrator |
| Willa | `2835530c-58d5-45bf-8fbe-9461234a0ee4` | cto / implementer |
| Tess | `e105f216-f3c6-4026-b3af-b3b120eca6ca` | qa / reviewer + approver |
| Piper | `9f2c557a-bac7-4948-8445-9538d9749148` | support / CS agent |

## VPS

- **IP**: `root@100.117.92.5` (Tailnet only — port 22 not public)
- **SSH key**: `~/.ssh/agentos_migration_2026-05-27` (local) or fetch from AWS SM `agentos/otis/vps_ssh_key`
- **Tailscale required** — both local and cloud sessions have it; cloud setup connects on startup

```bash
# Fetch key if not present locally
aws secretsmanager get-secret-value --secret-id agentos/otis/vps_ssh_key \
  --region us-east-1 --query SecretString --output text > /tmp/vps_key && chmod 600 /tmp/vps_key
ssh -i /tmp/vps_key -o StrictHostKeyChecking=no root@100.117.92.5
```

## VPS Layout — Source of Truth

| Path | What lives here | Change via |
|---|---|---|
| `/opt/hermes-profiles/<agent>/` | Hermes profile: config.yaml, .env, auth.json | Edit on VPS (no repo) |
| `/opt/hermes-wrappers/<agent>.sh` | Agent launch wrappers (timeout, env, hermes command) | **agentos-config repo → PR** |
| `/opt/hermes-venv/` | Hermes Python venv (read-only in Docker) | Hermes upgrade process |
| `/docker/paperclip-ezk7/` | Paperclip Docker stack | See below |
| `/docker/paperclip-ezk7/data/plugins/kaleidoscope-issue-trigger/` | Routing plugin (dispatch logic) | **paperclip-issue-trigger repo → PR** |
| `/docker/paperclip-ezk7/data/agent-instructions/<agent>/` | Agent AGENTS.md instructions | **agentos-config repo → PR** |
| `/docker/paperclip-ezk7/patches/` | Host-applied Paperclip patches (boot-idempotent) | Edit on VPS |
| `/docker/paperclip-ezk7/.env` | Paperclip Docker env vars (keys, URLs) | Edit on VPS (no repo) |
| `~/.openclaw/scripts/` | Utility scripts (routine-health-monitor.py, etc.) | Edit on VPS |

**Rule: never edit wrappers or agent-instructions directly on VPS.** They are managed via agentos-config.
Editing directly causes drift and gets overwritten on next deploy.

## Repos and PRs

| Repo | What it controls | PR target |
|---|---|---|
| `chrisabad/agentos-config` | Hermes wrappers, agent instructions, fleet config | `main` |
| `chrisabad/paperclip-issue-trigger` | Paperclip routing plugin source (TypeScript) | `main` |
| `chrisabad/agentos-docs` | Operational documentation | `main` |
| `chrisabad/otis` | This repo — Otis context, HEARTBEAT.md, skills, memory | `main` |
| `chrisabad/font-replacer` | FON product (Figma plugin) | `main` |

GitHub App identity for PRs: use `gen-github-token.py` (App authors). Chris's `chrisabad` PAT approves+merges.

```bash
export GH_TOKEN=$(python3 setup/gen-github-token.py)
git config user.name "Otis (AGE)"
git config user.email "3927680+otis-age[bot]@users.noreply.github.com"
```

## Dispatch Mechanism (how agents get work)

Agents use `hermes_local` adapter — Paperclip's internal worker spawns `hermesCommand` inside the Docker container (Hermes venv is bind-mounted at `/opt/hermes-venv` and profiles at `/opt/hermes-profiles`).

Dispatch flow: `todo` issue → Paperclip worker → spawns `hermesCommand` → agent runs → marks `in_review` / `done`

**Review gate (execution policy)**: Issues without `executionPolicy` set never trigger the reviewer. The routing plugin's `sweepIssueOnboarding` applies A4Policy to `todo/backlog` but NOT to `in_review`. If an agent manually sets `in_review` without going through the checkout flow (`checkoutRunId` stays null), the gate never fires and the reviewer is never woken.

Wake an agent manually:
```bash
curl -s -X POST "$PAPERCLIP_API/agents/<agentId>/wakeup" \
  -H "Authorization: Bearer $PAPERCLIP_BOARD_KEY_CLOUD" \
  -H "Content-Type: application/json"
```

## Routing Plugin

**File**: `/docker/paperclip-ezk7/data/plugins/kaleidoscope-issue-trigger/routing-rules.json`  
**Source**: `chrisabad/paperclip-issue-trigger` repo  
**Reload**: container restart required after edits (`docker restart paperclip-ezk7-paperclip-1`)

AGE routing: `implementer=Axel`, `reviewer=Ellis`, `approver=Ellis`, `orchestrator=Juno`  
FON routing: `implementer=Willa`, `reviewer=Tess`, `approver=Tess`, `orchestrator=Juno(FON)`

Plugin version is compiled — edit source in repo, build (`npm run build`), copy dist to VPS, restart.

## Paperclip DB (embedded Postgres)

Container-local, not host-exposed. Access via `docker exec`:

```bash
docker exec paperclip-ezk7-paperclip-1 node -e "
const { Client } = require('/usr/local/lib/node_modules/paperclipai/node_modules/pg');
const c = new Client({ host: '127.0.0.1', port: 54329, user: 'paperclip', password: 'paperclip', database: 'paperclip' });
c.connect().then(() => c.query('SELECT name, status FROM agents')).then(r => { console.log(r.rows); c.end(); });
"
```

**Kill-switch** (dispatch storm): `UPDATE agents SET status='paused'`  
Re-enable: `UPDATE agents SET status='idle'`

## LiteLLM Proxy

- **Endpoint**: `http://srv1724463.hstgr.cloud:42171`
- **Admin key**: `JKkw1Z0hc7HBsikGRNgz4RnOfqhefxCi`
- **Fleet routing**: all 11 agent profiles have `OLLAMA_BASE_URL=http://srv1724463.hstgr.cloud:42171/v1` in their `.env`
- **Model aliases**: `routine` → `deepseek-v4-flash`, `interactive` → `gemma4:31b`, `lightweight` → `ministral-3:3b`, `vision` → `gemma3:12b`
- **DO NOT change models without a bakeoff** — see `model-eval` skill

## Services on VPS

| Service | Purpose | Restart |
|---|---|---|
| `paperclip-ezk7-paperclip-1` | Paperclip Docker container | `docker restart paperclip-ezk7-paperclip-1` |
| `hermes-dashboard.service` | Hermes Dashboard (remote backend) | `systemctl restart hermes-dashboard` |
| `hermes-juno-gateway.service` | Juno Slack/Plain escalation webhook | `systemctl restart hermes-juno-gateway` |
| `hermes-piper-gateway.service` | Piper Plain CS webhook | `systemctl restart hermes-piper-gateway` |
| `agent-vault` | Infisical credential proxy | `docker restart agent-vault` |
| `tailscaled.service` | Tailscale (VPN for SSH access) | Do not restart casually |

Maintenance window for changes causing downtime: **2:00–4:00 AM PT**.

## Key AWS Secrets Manager Secrets

Region: `us-east-1`. Access via local AWS credentials (in `.env`).

| Secret | Contents |
|---|---|
| `agentos/otis/vps_ssh_key` | VPS SSH private key |
| `agentos/juno/slack_*` | Juno's Slack tokens |
| `agentos/piper/plain_api_key` | Piper's Plain API key |
| `agentos/piper/lemonsqueezy_api_key` | LemonSqueezy API key |
| `agentos/honcho/openai_api_key` | Honcho OpenAI key |
| `agentos/langfuse/secret_key` | Langfuse secret key |
| `agentos/langfuse/public_key` | Langfuse public key |

## Honcho (self-hosted)

- **Endpoint**: `http://100.117.92.5:8000` (VPS, Tailnet only)
- **Version**: v3.0.9 — uses `/v3` REST API path (NOT `/v2` — published SDK/MCP are v2, incompatible)
- **Model**: OpenAI via AWS SM key, `$20/mo` cap

## What NOT to do

- Do not edit `/opt/hermes-wrappers/` directly — use agentos-config repo
- Do not edit `/docker/paperclip-ezk7/data/agent-instructions/` directly — use agentos-config repo
- Do not edit routing-rules.json on VPS without a repo PR (drift risk)
- Do not change adapterConfig models without a bakeoff
- Do not skip maintenance window for gateway/LiteLLM restarts
- Do not set `X-Paperclip-Run-Id` header in direct API calls (500s outside real heartbeat runs)
