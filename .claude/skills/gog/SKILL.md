---
name: gog
description: Google Workspace CLI for Gmail, Calendar, Drive, Contacts, Sheets, and Docs. Use when you need to read/search email, calendars, files, contacts, spreadsheets, or docs in Google Workspace, and when drafting content that requires Google account data.
version: 1.0.0
audience: shared
agents: [otis]
---
# gog

Use `gog` for Gmail/Calendar/Drive/Contacts/Sheets/Docs. Requires OAuth setup.

Setup (once)
- `gog auth credentials /path/to/client_secret.json`
- `gog auth add you@gmail.com --services gmail,calendar,drive,contacts,sheets,docs`
- `gog auth list`

Common commands
- Gmail search: `gog gmail search 'newer_than:7d' --max 10`
- Gmail send: `gog gmail send --to a@b.com --subject "Hi" --body "Hello"`
- Gmail archive thread (remove from inbox): `gog gmail thread modify <threadId> --remove INBOX --no-input --force`
- Gmail add label: `gog gmail thread modify <threadId> --add LABEL_NAME --no-input --force`
- Calendar: `gog calendar events <calendarId> --from <iso> --to <iso>`
- Drive search: `gog drive search "query" --max 10`
- Contacts: `gog contacts list --max 20`
- Sheets get: `gog sheets get <sheetId> "Tab!A1:D10" --json`
- Sheets update: `gog sheets update <sheetId> "Tab!A1:B2" --values-json '[["A","B"],["1","2"]]' --input USER_ENTERED`
- Sheets append: `gog sheets append <sheetId> "Tab!A:C" --values-json '[["x","y","z"]]' --insert INSERT_ROWS`
- Sheets clear: `gog sheets clear <sheetId> "Tab!A2:Z"`
- Sheets metadata: `gog sheets metadata <sheetId> --json`
- Docs export: `gog docs export <docId> --format txt --out /tmp/doc.txt`
- Docs cat: `gog docs cat <docId>`

Notes
- Set `GOG_ACCOUNT=you@gmail.com` to avoid repeating `--account`.
- **Non-interactive environments:** Always prefix gog commands with `export GOG_KEYRING_PASSWORD="gog-2026"`, `export GOG_ACCOUNT=<account>`, and `export XDG_CONFIG_HOME=~/.hermes/profiles/<agent>/home/.config`. Without these, gog will hang waiting for a TTY keyring prompt. The `XDG_CONFIG_HOME` variable is crucial for isolating agent token stores.
- **Multi-agent environments:** `gog` is not designed to be used in a multi-agent environment where each agent has its own set of credentials. It is recommended that the `gog` skill be disabled for all agents except for one.
- For scripting, prefer `--json` plus `--no-input`.
- Sheets values can be passed via `--values-json` (recommended) or as inline rows.
- Docs supports export/cat/copy. In-place edits require a Docs API client (not in gog).
- Confirm before sending mail or creating events.
