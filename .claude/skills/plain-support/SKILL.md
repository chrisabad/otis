---
name: plain-support
description: Access Plain customer support platform via GraphQL API. Read/write customers, threads, timeline, help center. Requires PLAIN_API_KEY env var and curl+jq.
version: 2.2.0
audience: shared
metadata:
  hermes:
    tags: [customer-support, plain, graphql]
    requires:
      env: [PLAIN_API_KEY]
      bins: [curl, jq]
---

# Plain API Skill

Access to the Plain customer support platform via GraphQL API. The official Plain agent skill (`team-plain/plain-support`) was installed via `npx skills add team-plain/plain-support --yes` and verified functional with the Piper API key.

## Prerequisites

- `PLAIN_API_KEY` environment variable set with your Plain API key
- `curl` and `jq` installed
- Skill scripts installed at `~/.agents/skills/plain-support/scripts/plain-api.sh`

## API Endpoint

Default: `https://core-api.uk.plain.com/graphql/v1`
Override with `PLAIN_API_URL` env var.

**Important:** Do NOT use `api.plain.com` — it returns HTTP 403. The correct endpoint is `core-api.uk.plain.com`.

## Key Retrieval

```bash
# Piper API key
PIPER_KEY=$(aws secretsmanager get-secret-value --secret-id agentos/piper/plain_api_key --query SecretString --output text | python3 -c "import sys,json; print(json.loads(sys.stdin.read())['api_key'])")
export PLAIN_API_KEY=*** Juno API key
JUNO_KEY=$(aws secretsmanager get-secret-value --secret-id agentos/juno/plain_api_key --query SecretString --output text | python3 -c "import sys,json; print(json.loads(sys.stdin.read())['api_key'])")
export PLAIN_API_KEY="$JUN...
```

## Quick Reference

### Customers (Read Only)

```bash
~/.agents/skills/plain-support/scripts/plain-api.sh customer list --first 10
~/.agents/skills/plain-support/scripts/plain-api.sh customer get c_01ABC...
~/.agents/skills/plain-support/scripts/plain-api.sh customer get-by-email user@example.com
~/.agents/skills/plain-support/scripts/plain-api.sh customer get-by-external-id your-system-id
~/.agents/skills/plain-support/scripts/plain-api.sh customer search "john doe"
```

### Threads (Read + Write)

```bash
# List threads (TODO status by default)
~/.agents/skills/plain-support/scripts/plain-api.sh thread list --first 20

# List all threads including done
~/.agents/skills/plain-support/scripts/plain-api.sh thread list --status all

# List done threads
~/.agents/skills/plain-support/scripts/plain-api.sh thread list --status DONE

# List threads by priority
~/.agents/skills/plain-support/scripts/plain-api.sh thread list --priority urgent
~/.agents/skills/plain-support/scripts/plain-api.sh thread list --priority high
~/.agents/skills/plain-support/scripts/plain-api.sh thread list --status TODO --priority low

# Get thread details
~/.agents/skills/plain-support/scripts/plain-api.sh thread get th_01ABC...

# Search threads
~/.agents/skills/plain-support/scripts/plain-api.sh thread search "billing issue"

# Get thread timeline
~/.agents/skills/plain-support/scripts/plain-api.sh thread timeline th_01ABC... --first 50

# Add a note to a thread (internal note, not visible to customer)
~/.agents/skills/plain-support/scripts/plain-api.sh thread note th_01ABC... --text "Internal note"

# Add a note with markdown formatting
~/.agents/skills/plain-support/scripts/plain-api.sh thread note th_01ABC... --text "Note text" --markdown "**Bold** and *italic*"

# Add a note from a file
~/.agents/skills/plain-support/scripts/plain-api.sh thread note th_01ABC... --text-file /path/to/note.txt
```

**Thread list options:**

| Option | Description |
|--------|-------------|
| `--status` | Filter: `TODO`, `SNOOZED`, `DONE`, or `all` |
| `--priority` | Filter: `urgent`, `high`, `normal`, `low` |
| `--customer` | Filter by customer ID |
| `--first` | Number of results (default: 10) |

### Thread Links (Read + Write)

```bash
# Add a GitHub issue or PR link
~/.agents/skills/plain-support/scripts/plain-api.sh thread link add th_01ABC... https://github.com/owner/repo/issues/45
~/.agents/skills/plain-support/scripts/plain-api.sh thread link add th_01ABC... owner/repo#45

# List links on a thread
~/.agents/skills/plain-support/scripts/plain-api.sh thread link list th_01ABC...
```

### Companies / Tenants / Labels (Read Only)

```bash
~/.agents/skills/plain-support/scripts/plain-api.sh company list --first 10
~/.agents/skills/plain-support/scripts/plain-api.sh company get co_01ABC...
~/.agents/skills/plain-support/scripts/plain-api.sh tenant list --first 10
~/.agents/skills/plain-support/scripts/plain-api.sh tenant get ten_01ABC...
~/.agents/skills/plain-support/scripts/plain-api.sh label list --first 20
```

### Help Center (Read + Write)

```bash
~/.agents/skills/plain-support/scripts/plain-api.sh helpcenter list
~/.agents/skills/plain-support/scripts/plain-api.sh helpcenter get hc_01ABC...
~/.agents/skills/plain-support/scripts/plain-api.sh helpcenter articles hc_01ABC... --first 20

# Create article (defaults to DRAFT)
~/.agents/skills/plain-support/scripts/plain-api.sh helpcenter article upsert hc_01ABC... \
  --title "How to reset password" \
  --description "Step-by-step guide" \
  --content "<h1>Reset Password</h1><p>Follow these steps...</p>" \
  --status PUBLISHED

# Update existing article
~/.agents/skills/plain-support/scripts/plain-api.sh helpcenter article upsert hc_01ABC... \
  --id hca_01ABC... \
  --title "Updated Title" \
  --description "Updated description" \
  --content "<p>New content</p>"
```

### Workspace / Tiers

```bash
~/.agents/skills/plain-support/scripts/plain-api.sh workspace
~/.agents/skills/plain-support/scripts/plain-api.sh tier list
~/.agents/skills/plain-support/scripts/plain-api.sh tier get tier_01ABC...
```

## Common Workflows

### Research customer history

1. Get customer: `customer get c_...` or `customer get-by-email user@example.com`
2. List their threads: `thread list --customer c_... --status all`
3. Get thread details: `thread get th_...`
4. Read full conversation: `thread timeline th_... --first 100`

### Add internal note to thread

1. Get thread ID from URL or search: `thread search "keyword"`
2. Add note: `thread note th_... --text "Investigation notes here"`
3. Verify in timeline: `thread timeline th_... --first 5`

## Thread Status / Priority

- **Status:** `TODO` (needs attention), `SNOOZED` (deferred), `DONE` (resolved)
- **Priority:** `urgent` (0) > `high` (1) > `normal` (2, default) > `low` (3)

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PLAIN_API_KEY` | Yes | Your Plain API key |
| `PLAIN_API_URL` | No | API endpoint (default: `https://core-api.uk.plain.com/graphql/v1`) |

## Installation

```bash
npx skills add team-plain/plain-support --yes
```

Installs to `~/.agents/skills/plain-support/` (universal) with symlinks for Claude Code and Hermes Agent.

## Verification (2026-06-06)

- `customer list --first 5`: returned 5 customers successfully
- `thread list --first 5`: returned 6 threads with various statuses/priorities
- API endpoint `core-api.uk.plain.com` works correctly
- `api.plain.com` returns HTTP 403 Forbidden (do NOT use)
- Piper API key (AWS SM `agentos/piper/plain_api_key`): valid, 55 chars