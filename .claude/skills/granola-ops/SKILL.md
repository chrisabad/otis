---
name: granola-ops
description: Granola meeting integration via REST API. Use for pulling meeting notes, listing meetings, and archiving transcripts. No MCP server is configured — all Granola access goes through exec + the REST API script.
version: 1.1.0
audience: shared
agents: [otis, juno]
---
# granola-ops

Access Granola meeting data via the REST API. **Do NOT call `mcp__granola__*` tools — no MCP server is configured for Granola.** Use `exec` with the scripts below instead.

## Prerequisites

- `GRANOLA_API_KEY` must be available in the workspace `.env` or as an environment variable
- Granola desktop app must be installed and logged in on the host machine

## Common Operations

### List recent meetings (watcher)

Run the meeting watcher script to archive new meetings to `memory/meetings/`:

```bash
GRANOLA_API_KEY=$(cat /home/hermes/.hermes/.granola-api-key) python3 /home/hermes/.hermes/workspace/tools/granola-meeting-watcher.py
```

This script:
- Checks for new notes from the last hour (business hours only: 9am–9pm PT weekdays)
- Archives them as markdown files in `memory/meetings/YYYY-MM-DD-slug.md`
- Reports escalation items if Chris has action items with deadlines

### Read a specific archived meeting

```bash
cat /home/hermes/.hermes/workspace/memory/meetings/<filename>.md
```

### List all archived meetings

```bash
ls /home/hermes/.hermes/workspace/memory/meetings/
```

### Direct API query (advanced)

For custom queries against the Granola REST API:

```bash
GRANOLA_API_KEY=$(cat /home/hermes/.hermes/.granola-api-key) python3 -c "
import json, urllib.request, os
key = os.environ['GRANOLA_API_KEY']
url = 'https://public-api.granola.ai/v1/notes?limit=10'
req = urllib.request.Request(url, headers={'Authorization': f'Bearer {key}'})
resp = urllib.request.urlopen(req)
data = json.loads(resp.read())
for note in data.get('notes', []):
    print(note.get('title','Untitled'), '|', note.get('createdAt','')[:10])
"
```

### Fetch a specific note by ID

```bash
GRANOLA_API_KEY=$(cat /home/hermes/.hermes/.granola-api-key) python3 -c "
import json, urllib.request, os, sys
key = os.environ['GRANOLA_API_KEY']
note_id = sys.argv[1]
url = f'https://public-api.granola.ai/v1/notes/{note_id}'
req = urllib.request.Request(url, headers={'Authorization': f'Bearer {key}'})
resp = urllib.request.urlopen(req)
print(json.loads(resp.read()).get('content', json.dumps(json.loads(resp.read()), indent=2)))
" <NOTE_ID>
```

## Important Notes
## Important Notes

- **No MCP server for Granola.** The Granola MCP server was unreliable and has been removed from mcporter config. Never call `mcp__granola__*` tools. Always use the REST API via the scripts above.
- **Do not add Granola to mcporter.** If you find a `granola` entry in any `mcporter.json` or `credentials.json`, remove it. The REST API is the only supported path.
- The meeting watcher only runs during business hours (9am–9pm PT, weekdays). Outside those hours, it exits silently.
- Meeting transcripts are archived to `/home/hermes/.hermes/workspace/memory/meetings/` with date-prefixed filenames.
- The API key is stored at `/home/hermes/.hermes/.granola-api-key` and in the workspace `.env`.
