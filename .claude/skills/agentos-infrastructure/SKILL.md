---
name: agentos-infrastructure
description: >
  Orientation + quick-reference for AGE infrastructure work on the AgentOS
  deployment. Load this whenever a task involves either VPS, the Paperclip Docker
  container, its embedded PostgreSQL, server patches, plugin deployment, LiteLLM
  proxy, agent profile/config changes, or secrets management. You are NOT in a
  sandbox — you run on a real VPS with full shell and Docker access. Full
  topology lives in agentos-docs; this skill is the map + the commands you
  reach for most.
version: 1.1.0
audience: shared
---

# AgentOS Infrastructure — Orientation & Quick Reference

## You are on a VPS, not in a sandbox

AgentOS runs on **two VPS nodes** (both Debian, SSH over Tailscale). You have a
real shell and `docker` on each. If a task says "patch the Paperclip server" or
"change a config," you almost certainly **have the access to do it** — don't
conclude "this environment can't reach Docker." Check first.

## VPS Topology

| Node | Hostname | Tailnet IP | Role |
|------|----------|-----------|------|
| Main (Paperclip) | srv1710374.hstgr.cloud | 100.117.92.5 | Paperclip app + Traefik + embedded Postgres + all Hermes agent profiles |
| LiteLLM proxy | srv1724463.hstgr.cloud | 2.25.162.2 | LiteLLM proxy on port 42171; model gateway for all fleet agents |

SSH to either node requires the Tailscale network and the `agentos/otis/vps_ssh_key`
secret from AWS Secrets Manager (see Secrets section below).

```bash
# Main VPS
ssh -i /tmp/vps_key -o StrictHostKeyChecking=no root@100.117.92.5

# LiteLLM proxy VPS
ssh -i /tmp/vps_key -o StrictHostKeyChecking=no root@2.25.162.2
```

## LiteLLM Proxy

The fleet's LLM traffic routes through a LiteLLM proxy on the second VPS:

- **URL:** `http://srv1724463.hstgr.cloud:42171`
- **Admin key:** AWS SM secret `agentos/litellm/master_key`
- **Model aliases:** `routine` → deepseek-v4-flash (Medium), `interactive` → glm-5.1:cloud (High)
- Each fleet agent has its own LiteLLM virtual key (per-agent RPM limits + model restrictions)
- Agent config.yaml files reference the proxy at `base_url: http://srv1724463.hstgr.cloud:42171/v1`

```bash
# Quick health check
curl -s http://srv1724463.hstgr.cloud:42171/health
```

## Where the full docs are

Read these in `agentos-docs` before non-trivial infra work — they are the
source of truth and are kept current:

- `operations/docker.mdx` — the Paperclip container, embedded Postgres, patches
- `architecture/overview.mdx` — system topology
- `agents/infrastructure.mdx` — the agent roster, roles, models

If you find a doc that contradicts what you observe live, **the live system
wins** — fix the doc (PR to agentos-docs) as part of your work.

## Source of Truth for Agent Profiles and Skills

| Artifact | Source of truth repo | Deployed location on main VPS |
|----------|---------------------|-------------------------------|
| Agent instructions (SOUL.md, AGENTS.md, etc.) | `chrisabad/agentos-config` → `hermes/profiles/<agent>/` | `/opt/hermes-profiles/<agent>/` |
| Shared + agent-specific skills | `chrisabad/agentos-skills` → `skills/<skill-name>/` | `/docker/paperclip-ezk7/data/.agentos-skills/skills/` |

CI rsyncs both repos to the VPS on merge to `main`. **Direct edits on the VPS
are temporary** — overwritten on the next deploy. Always land changes via PR to
the appropriate repo.

## Secrets Management

Secrets follow a layered pattern:

1. **AWS Secrets Manager** (`us-east-1`) — canonical store for all sensitive values
2. **VPS `.env` files** — static files at `/opt/hermes-profiles/<agent>/.env`; some values
   are sourced from AWS SM at deploy time, others are baked in directly
3. **Paperclip `adapterConfig`** — Paperclip board/agent keys are injected via adapterConfig
   and are NOT stored in AWS SM; they appear as `***` in the API (non-issue)

Common secrets in AWS SM:
- `agentos/otis/vps_ssh_key` — SSH private key for both VPS nodes
- `agentos/litellm/master_key` — LiteLLM admin key
- `agentos/honcho/openai_api_key` — OpenAI key for self-hosted Honcho
- `agentos/<agent>/slack_*` — Slack tokens per agent
- `agentos/piper/lemonsqueezy_api_key` — LemonSqueezy key for Piper

```bash
# Fetch a secret
aws secretsmanager get-secret-value --secret-id agentos/otis/vps_ssh_key \
  --region us-east-1 --query SecretString --output text
```

## Quick reference — Main VPS

```bash
docker ps                       # Paperclip + Traefik containers
ls /docker/paperclip-ezk7/      # the deployment lives here
```

### The Paperclip container

| Thing | Value |
|-------|-------|
| Container | `paperclip-ezk7-paperclip-1` |
| Image | `ghcr.io/hostinger/hvps-paperclip:latest` |
| Compose | `/docker/paperclip-ezk7/docker-compose.yml` |
| Public API | `https://paperclip-ezk7.srv1710374.hstgr.cloud/api` |
| Server code (in container) | `/usr/local/lib/node_modules/paperclipai/node_modules/@paperclipai/server/dist/` |

```bash
docker exec paperclip-ezk7-paperclip-1 <cmd>
docker exec -u root paperclip-ezk7-paperclip-1 <cmd>   # writes to node_modules
docker logs --since 5m paperclip-ezk7-paperclip-1
```

### Embedded PostgreSQL (inside the container)

There is **no separate DB container**. Postgres is embedded in the Paperclip
container. The port is not published to the host — connect from inside:

```bash
docker exec -e PGPASSWORD=paperclip paperclip-ezk7-paperclip-1 \
  psql -h /tmp -p 54329 -U paperclip -d paperclip -c "SELECT 1;"
```

- Data dir: `/paperclip/instances/default/db` · port `54329` (socket `/tmp`) · user/pass/db `paperclip` · UTF8

### Server patches (the durable way to change Paperclip)

Paperclip = upstream npm package + MATCH/REPLACE patches applied **at container
entrypoint**.

- Live: `/docker/paperclip-ezk7/patches/*.patch` · applied by `apply-patches-docker.sh`
- **Source of truth (PR here):** `agentos-config/paperclip-patches/`
- Format: a `--- Target:` header (path under `node_modules/`), then `MATCH:` and
  `REPLACE:` blocks. Idempotent; fails if MATCH text is absent (stale patch).

```bash
# Which patches are applied / needed / stale against the current version?
docker exec paperclip-ezk7-paperclip-1 \
  /docker/paperclip-ezk7/patches/apply-patches-docker.sh --check
```

To ship a server change: add a `.patch` to `agentos-config/paperclip-patches/`
(PR), deploy to `/docker/paperclip-ezk7/patches/`, restart. Template:
`058-plugin-worker-board-key-env.patch`.

### Execution policy at create time (don't reinvent)

New issues get their review/approval policy from `companies.default_execution_policy`
(or a project's) via the patch-053 create-time fallback — applied synchronously,
no plugin event needed. To change the default policy for a company, update that
column (embedded psql). `workMode=planning` is separate and set per-issue by the
issue-trigger plugin (skips child tasks).

### The issue-trigger plugin

- Deployed dist: `/docker/paperclip-ezk7/data/plugins/kaleidoscope-issue-trigger/`
- Source: `paperclip-issue-trigger` repo (build with esbuild; bump
  `paperclip.manifest.json` version to trigger a worker reload)

### Repos on the VPS

`/docker/paperclip-ezk7/data/repos/`: `agentos-config`, `agentos-docs`,
`agentos-skills`, `paperclip-issue-trigger`, `hermes`.

### GitHub auth (if `gh`/git push fails)

Mint a GitHub App token instead of escalating:

```bash
eval "$(/opt/hermes-profiles/<you>/bin/mint-github-token.sh)"   # sets GH_TOKEN
git remote set-url origin "https://x-access-token:${GH_TOKEN}@github.com/chrisabad/<repo>.git"
```

## Golden rules

1. **Verify before concluding you lack access.** Run `docker ps` / `ls` first.
2. **Durable beats live.** A live edit on the VPS is lost on redeploy/restart
   unless it's a patch in `/patches/` or committed to the source repo. Land the
   change in `agentos-config` / the relevant repo via PR.
3. **Live system is ground truth.** If docs disagree with reality, fix the docs.
4. **All changes flow through Paperclip + SDLC** — open/track an issue, PR with
   CI, review gate, merge. No direct pushes to `main`.
5. **Secrets go in AWS SM first**, then sync to VPS .env files. Never hardcode
   secrets in config files or commit them to any repo.
