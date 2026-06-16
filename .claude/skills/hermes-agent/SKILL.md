---
name: hermes-agent
description: "Configure, extend, or contribute to Hermes Agent."
version: 2.1.0
author: Hermes Agent + Teknium
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [hermes, setup, configuration, multi-agent, spawning, cli, gateway, development]
    homepage: https://github.com/NousResearch/hermes-agent
    related_skills: [claude-code, codex, opencode]
---

# Hermes Agent

Hermes Agent is an open-source AI agent framework by Nous Research that runs in your terminal, messaging platforms, and IDEs. It belongs to the same category as Claude Code (Anthropic), Codex (OpenAI), and OpenClaw — autonomous coding and task-execution agents that use tool calling to interact with your system. Hermes works with any LLM provider (OpenRouter, Anthropic, OpenAI, DeepSeek, local models, and 15+ others) and runs on Linux, macOS, and WSL.

What makes Hermes different:

- **Self-improving through skills** — Hermes learns from experience by saving reusable procedures as skills. When it solves a complex problem, discovers a workflow, or gets corrected, it can persist that knowledge as a skill document that loads into future sessions. Skills accumulate over time, making the agent better at your specific tasks and environment.
- **Persistent memory across sessions** — remembers who you are, your preferences, environment details, and lessons learned. Pluggable memory backends (built-in, Honcho, Mem0, and more) let you choose how memory works.
- **Multi-platform gateway** — the same agent runs on Telegram, Discord, Slack, WhatsApp, Signal, Matrix, Email, and 10+ other platforms with full tool access, not just chat.
- **Provider-agnostic** — swap models and providers mid-workflow without changing anything else. Credential pools rotate across multiple API keys automatically.
- **Profiles** — run multiple independent Hermes instances with isolated configs, sessions, skills, and memory.
- **Extensible** — plugins, MCP servers, custom tools, webhook triggers, cron scheduling, and the full Python ecosystem.

**This skill helps you work with Hermes Agent effectively** — setting it up, configuring features, spawning additional agent instances, troubleshooting issues, finding the right commands and settings, and understanding how the system works when you need to extend or contribute to it.

**Docs:** https://hermes-agent.nousresearch.com/docs/

## AGE-Specific Notes

In the AGE fleet, Hermes runs on the main VPS (`root@100.117.92.5`). Key paths:

- Profiles: `~/.hermes/profiles/<agent>/` (symlinked from `/opt/hermes-profiles/<agent>/` which is the agentos-config repo)
- Shared skills: `/docker/paperclip-ezk7/data/.agentos-skills/skills/` (90 bundled AGE skills)
- Config source of truth: `chrisabad/agentos-config` → `hermes/profiles/<agent>/`
- Hermes runs inside the Paperclip container: `HOME=/paperclip` → `~` = `/docker/paperclip-ezk7/data/`
- `hermes skills tap list` is empty — skills loaded via `external_dirs` config

## Quick Start

```bash
# Install
curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash

# Interactive chat (default)
hermes

# Single query
hermes chat -q "What is the capital of France?"

# Setup wizard
hermes setup

# Change model/provider
hermes model

# Check health
hermes doctor
```

---

## CLI Reference

### Global Flags

```
hermes [flags] [command]

  --version, -V             Show version
  --resume, -r SESSION      Resume session by ID or title
  --continue, -c [NAME]     Resume by name, or most recent session
  --worktree, -w            Isolated git worktree mode (parallel agents)
  --skills, -s SKILL        Preload skills (comma-separate or repeat)
  --profile, -p NAME        Use a named profile
  --yolo                    Skip dangerous command approval
  --pass-session-id         Include session ID in system prompt
```

No subcommand defaults to `chat`.

### Chat

```
hermes chat [flags]
  -q, --query TEXT          Single query, non-interactive
  -m, --model MODEL         Model (e.g. anthropic/claude-sonnet-4)
  -t, --toolsets LIST       Comma-separated toolsets
  --provider PROVIDER       Force provider (openrouter, anthropic, nous, etc.)
  -v, --verbose             Verbose output
  -Q, --quiet               Suppress banner, spinner, tool previews
  --checkpoints             Enable filesystem checkpoints (/rollback)
  --source TAG              Session source tag (default: cli)
```

### Configuration

```
hermes setup [section]      Interactive wizard (model|terminal|gateway|tools|agent)
hermes model                Interactive model/provider picker
hermes config               View current config
hermes config edit          Open config.yaml in $EDITOR
hermes config set KEY VAL   Set a config value
hermes config path          Print config.yaml path
hermes config env-path      Print .env path
hermes config check         Check for missing/outdated config
hermes config migrate       Update config with new options
hermes auth                 Interactive credential manager
hermes auth add PROVIDER    Add OAuth or API-key credential (e.g. nous, openai-codex, qwen-oauth)
hermes auth list            List stored credentials
hermes auth remove PROVIDER Remove a stored credential
hermes doctor [--fix]       Check dependencies and config
hermes status [--all]       Show component status
```

### Tools & Skills

```
hermes tools                Interactive tool enable/disable (curses UI)
hermes tools list           Show all tools and status
hermes tools enable NAME    Enable a toolset
hermes tools disable NAME   Disable a toolset

hermes skills list          List installed skills
hermes skills search QUERY  Search the skills hub
hermes skills install ID    Install a skill (ID can be a hub identifier OR a direct https://…/SKILL.md URL; pass --name to override when frontmatter has no name)
hermes skills inspect ID    Preview without installing
hermes skills config        Enable/disable skills per platform
hermes skills check         Check for updates
hermes skills update        Update outdated skills
hermes skills uninstall N   Remove a hub skill
hermes skills publish PATH  Publish to registry
hermes skills browse        Browse all available skills
hermes skills tap add REPO  Add a GitHub repo as skill source
```

### MCP Servers

```
hermes mcp serve            Run Hermes as an MCP server
hermes mcp add NAME         Add an MCP server (--url or --command)
hermes mcp remove NAME      Remove an MCP server
hermes mcp list             List configured servers
hermes mcp test NAME        Test connection
hermes mcp configure NAME   Toggle tool selection
```

### Gateway (Messaging Platforms)

```
hermes gateway run          Start gateway foreground
hermes gateway install      Install as background service
hermes gateway start/stop   Control the service
hermes gateway restart      Restart the service
hermes gateway status       Check status
hermes gateway setup        Configure platforms
```

Supported platforms: Telegram, Discord, Slack, WhatsApp, Signal, Email, SMS, Matrix, Mattermost, Home Assistant, DingTalk, Feishu, WeCom, BlueBubbles (iMessage), Weixin (WeChat), API Server, Webhooks.

### Sessions

```
hermes sessions list        List recent sessions
hermes sessions browse      Interactive picker
hermes sessions export OUT  Export to JSONL
hermes sessions rename ID T Rename a session
hermes sessions delete ID   Delete a session
hermes sessions prune       Clean up old sessions (--older-than N days)
hermes sessions stats       Session store statistics
```

### Cron Jobs

```
hermes cron list            List jobs (--all for disabled)
hermes cron create SCHED    Create: '30m', 'every 2h', '0 9 * * *'
hermes cron edit ID         Edit schedule, prompt, delivery
hermes cron pause/resume ID Control job state
hermes cron run ID          Trigger on next tick
hermes cron remove ID       Delete a job
hermes cron status          Scheduler status
```

### Profiles

```
hermes profile list         List all profiles
hermes profile create NAME  Create (--clone, --clone-all, --clone-from)
hermes profile use NAME     Set sticky default
hermes profile delete NAME  Delete a profile
hermes profile show NAME    Show details
hermes profile alias NAME   Manage wrapper scripts
hermes profile rename A B   Rename a profile
hermes profile export NAME  Export to tar.gz
hermes profile import FILE  Import from archive
```

### Other

```
hermes insights [--days N]  Usage analytics
hermes update               Update to latest version
hermes plugins list/install/remove  Plugin management
hermes honcho setup/status  Honcho memory integration (requires honcho plugin)
hermes memory setup/status/off  Memory provider config
hermes completion bash|zsh  Shell completions
hermes acp                  ACP server (IDE integration)
hermes claw migrate         Migrate from OpenClaw
hermes uninstall            Uninstall Hermes
```

---

## Slash Commands (In-Session)

### Session Control
```
/new (/reset)        Fresh session
/clear               Clear screen + new session (CLI)
/retry               Resend last message
/undo                Remove last exchange
/title [name]        Name the session
/compress            Manually compress context
/stop                Kill background processes
/rollback [N]        Restore filesystem checkpoint
/background <prompt> Run prompt in background
/queue <prompt>      Queue for next turn
/agents (/tasks)     Show active agents and running tasks
/resume [name]       Resume a named session
/goal [text|sub]     Set a standing goal
```

### Configuration
```
/config              Show config (CLI)
/model [name]        Show or change model
/reasoning [level]   Set reasoning (none|minimal|low|medium|high|xhigh|show|hide)
/verbose             Cycle: off → new → all → verbose
/yolo                Toggle approval bypass
```

### Tools & Skills
```
/tools               Manage tools (CLI)
/skills              Search/install skills (CLI)
/skill <name>        Load a skill into session
/reload-skills       Re-scan ~/.hermes/skills/ for added/removed skills
/reload-mcp          Reload MCP servers
/cron                Manage cron jobs (CLI)
/curator [sub]       Background skill maintenance (status, run, pin, archive, …)
/kanban [sub]        Multi-agent work-queue tools
```

### Utility
```
/branch (/fork)      Branch the current session
/fast                Toggle priority/fast processing
/history             Show conversation history (CLI)
/help                Show commands
/quit (/exit, /q)    Exit CLI
```

---

## Key Paths & Config

```
~/.hermes/config.yaml       Main configuration
~/.hermes/.env              API keys and secrets
~/.hermes/skills/           Installed user-local skills
~/.hermes/sessions/         Session store (state.db + JSONL transcripts)
~/.hermes/logs/             Gateway and error logs
~/.hermes/auth.json         OAuth tokens and credential pools
```

Profiles use `~/.hermes/profiles/<name>/` with the same layout.

### Config Sections

| Section | Key options |
|---------|-------------|
| `model` | `default`, `provider`, `base_url`, `api_key`, `context_length` |
| `agent` | `max_turns` (90), `tool_use_enforcement` |
| `terminal` | `backend` (local/docker/ssh/modal), `cwd`, `timeout` (180) |
| `skills` | `external_dirs` (list of paths), `template_vars`, `inline_shell` |
| `curator` | `enabled`, `interval_hours`, `stale_after_days` |
| `memory` | `memory_enabled`, `provider` (honcho/mem0/built-in) |
| `delegation` | `model`, `provider`, `base_url`, `api_key`, `max_iterations` (50) |

---

## Durable & Background Systems

### Delegation (`delegate_task`)

Synchronous subagent spawn — parent waits for child's summary before continuing.

- **Single:** `delegate_task(goal, context, toolsets)`
- **Batch:** `delegate_task(tasks=[{goal, ...}, ...])` runs children in parallel (cap: `delegation.max_concurrent_children`, default 3)
- **Not durable.** If parent is interrupted, child is cancelled. For work that must outlive the turn, use `cronjob` or `terminal(background=True)`.

### Cron (scheduled jobs)

Durable scheduler. Drive via `cronjob` tool, `hermes cron` CLI, or `/cron` slash command.

- **Schedules:** duration (`"30m"`, `"2h"`), "every" phrase (`"every monday 9am"`), 5-field cron (`"0 9 * * *"`), or ISO timestamp.
- Cron sessions pass `skip_memory=True` by default.

### Curator (skill lifecycle)

Background maintenance for agent-created skills. Tracks usage, marks idle skills stale, archives them. Never deletes — max action is archive.

- **CLI:** `hermes curator status/run/pin/unpin/archive/restore/prune`
- **Slash:** `/curator <subcommand>`
- Only touches skills with `created_by: "agent"` provenance. Bundled + hub-installed skills are off-limits.
- Telemetry at `~/.hermes/skills/.usage.json`: `use_count`, `view_count`, `patch_count`, `last_activity_at`, `state`, `pinned`.

### Kanban (multi-agent work queue)

Durable SQLite board for multi-profile collaboration. Dispatches tasks to worker profiles.

- **CLI verbs:** `init`, `create`, `list`, `show`, `assign`, `complete`, `block`, `comment`, `archive`

---

## Contributor Quick Reference

### Project Layout

```
hermes-agent/
├── run_agent.py          # AIAgent — core conversation loop
├── model_tools.py        # Tool discovery and dispatch
├── toolsets.py           # Toolset definitions
├── cli.py                # Interactive CLI (HermesCLI)
├── hermes_state.py       # SQLite session store
├── agent/                # Prompt builder, context compression, memory, model routing
├── hermes_cli/           # CLI subcommands, config, setup, commands
│   ├── commands.py       # Slash command registry
│   └── config.py         # DEFAULT_CONFIG, env var definitions
├── tools/                # One file per tool
│   └── registry.py       # Central tool registry
├── gateway/              # Messaging gateway + platform adapters
├── cron/                 # Job scheduler
└── skills/               # Bundled skills by category
```

### Adding a Tool

```python
from tools.registry import registry

registry.register(
    name="example_tool",
    toolset="example",
    schema={"name": "example_tool", "description": "...", "parameters": {...}},
    handler=lambda args, **kw: example_tool(param=args.get("param", "")),
    check_fn=lambda: bool(os.getenv("EXAMPLE_API_KEY")),
    requires_env=["EXAMPLE_API_KEY"],
)
```

All handlers must return JSON strings. Use `get_hermes_home()` for paths, never hardcode `~/.hermes`.

### Key Rules

- Never break prompt caching — don't change context, tools, or system prompt mid-conversation
- Message role alternation — never two assistant or two user messages in a row
- Use `get_hermes_home()` from `hermes_constants` for all paths (profile-safe)
- Config values go in `config.yaml`, secrets go in `.env`

---

## Troubleshooting

### Skills not showing
1. `hermes skills list` — verify installed
2. Check `external_dirs` in config.yaml points to the correct path
3. Load explicitly: `/skill name` or `hermes -s name`
4. `/reload-skills` to re-scan without restarting

### Changes not taking effect
- **Tools/skills:** `/reset` starts a new session with updated toolset
- **Config changes:** In gateway: `/restart`. In CLI: exit and relaunch.

### Gateway issues
```bash
grep -i "failed to send\|error" ~/.hermes/logs/gateway.log | tail -20
```

Common: Gateway dies on SSH logout → `sudo loginctl enable-linger $USER`

### Model/provider issues
1. `hermes doctor` — check config and dependencies
2. `hermes auth` — re-authenticate OAuth providers
3. Check `.env` has the right API key

## Where to Find Things

| Looking for... | Location |
|----------------|----------|
| Config options | `hermes config edit` or [Configuration docs](https://hermes-agent.nousresearch.com/docs/user-guide/configuration) |
| Available tools | `hermes tools list` |
| Slash commands | `/help` in session |
| Skills catalog | `hermes skills browse` |
| Provider setup | `hermes model` |
| Cron jobs | `hermes cron list` |
| Memory | `hermes memory status` |
| CLI commands | `hermes --help` |
| Gateway logs | `~/.hermes/logs/gateway.log` |
| Full docs | https://hermes-agent.nousresearch.com/docs/ |
