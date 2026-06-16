---
name: notion
description: Read and write Weekend's Notion workspace (pages, databases, comments) via mcporter OAuth.
homepage: https://developers.notion.com
metadata:
  {
    "hermes":
      {
        "emoji": "📝",
        "requires": { "bins": ["mcporter"] },
      },
  }
version: 2.0.0
audience: shared
---
# notion

Access Notion via `mcporter call notion.*`. No API key needed — auth is via Chris's OAuth credentials stored in Juno's mcporter profile.

> **No NOTION_API_KEY.** Chris is not a Notion admin in the Weekend workspace, so an integration token cannot be minted. All Notion access goes through the official Notion MCP at `https://mcp.notion.com/mcp` via mcporter OAuth.

## Available Tools

Check current tool list (names can change between Notion MCP versions):

```bash
mcporter list notion --schema
```

As of May 2026 — 14 tools:

| Tool | Purpose |
|------|---------|
| `notion-search` | Search pages and databases by title/content |
| `notion-fetch` | Read a page (returns rendered `text` field) |
| `notion-create-pages` | Create one or more pages |
| `notion-update-page` | Update page content or properties |
| `notion-duplicate-page` | Duplicate a page |
| `notion-move-pages` | Move pages to a different parent |
| `notion-create-database` | Create a database (data source) |
| `notion-update-data-source` | Update database schema/properties |
| `notion-create-view` | Create a database view |
| `notion-update-view` | Update a database view |
| `notion-create-comment` | Add a comment to a page |
| `notion-get-comments` | List comments on a page |
| `notion-get-teams` | List teams in the workspace |
| `notion-get-users` | List workspace members |

## Common Operations

**Search for a page:**

```bash
mcporter call notion.notion-search --query "Song Quiz Art Bible"
```

**Read a page** (check `text` field, not `content`):

```bash
mcporter call notion.notion-fetch page_id="<uuid>"
# Parse output: jq '.text' or look for "text" key in JSON
```

**Create a page:**

```bash
mcporter call notion.notion-create-pages --args '{
  "pages": [{"properties": {"title": "New Page"}, "content": "## Section\n\nBody text."}]
}'
```

For pages inside a database:

```bash
mcporter call notion.notion-create-pages --args '{
  "pages": [{"properties": {"title": "New Item"}}],
  "parent": {"database_id": "<uuid>"}
}'
```

**Update page content** (replace full body) — use Python subprocess for reliability:

```python
import json, subprocess

args = {
    "page_id": "<uuid>",
    "command": "replace_content",
    "new_str": "## Updated\n\nNew body.",
    "properties": {}
}
result = subprocess.run(
    ['mcporter', 'call', 'notion.notion-update-page', '--args',
     json.dumps(args, ensure_ascii=True), '--output', 'json'],
    capture_output=True, text=True, timeout=180
)
# Always verify with notion-fetch afterwards — replace_content may silently fail
```

**Add a comment:**

```bash
mcporter call notion.notion-create-comment --args '{"page_id": "<uuid>", "rich_text": [{"text": {"content": "Comment here"}}]}'
```

**Grant page access to an external user** — not available via MCP. Star the email notification for Chris to handle manually.

## Auth

Credentials live at `~/.hermes/profiles/juno/home/.mcporter/credentials.json`. If `mcporter list notion` shows "auth required":

```bash
# Re-auth requires a browser (run from Lauryn node, not agent host)
mcporter auth notion --reset

# After auth completes, sync tokens to Juno's profile
cp ~/.mcporter/credentials.json ~/.hermes/profiles/juno/home/.mcporter/credentials.json
```

## Pitfalls

- **Tool names are prefixed** — use `notion-search`, not `search`. Always verify with `mcporter list notion --schema`.
- **`notion-fetch` result** — read `.text`, not `.content` (`.content` can be empty even when the page has content).
- **`notion-update-page` + large content** — use the Python subprocess pattern above with `ensure_ascii=True`. Inline shell JSON breaks for content >2K chars.
- **`replace_content` may silently fail** — always verify with `notion-fetch` after any write.
- **Granting access to external users** — no MCP tool exists for this. Star the email for Chris.

Full pitfall detail (credential sync, large-payload handling, re-auth steps): see `mcporter` skill.
