---
name: file-delivery
description: >
  Deliver generated files (PDFs, images, CSVs, etc.) from sub-agents or parent sessions to Slack
  or other channels. Use when an agent builds a file and needs to attach/send it to a user.
  Covers correct output paths, MEDIA syntax, and sub-agent vs. parent session routing rules.
  Triggers on: "send the file", "attach the PDF", "deliver the output", "share the image",
  any task that ends with a generated file the user needs to receive.
version: 1.0.0
audience: shared
---
# File Delivery

Two rules govern whether a file attachment succeeds. Both must be satisfied.

## Rule 1: Save to an allowed path

Hermes's media pipeline enforces an allowlist. Save ALL output files to one of:

- `/tmp/hermes/filename.ext` ✅
- `~/.hermes/media/filename.ext` ✅
- `~/.hermes/filename.ext` ✅

**Never** save to `/tmp/filename.ext` — this silently fails the path check even though the file exists.

```bash
# Good
output_path = "/tmp/hermes/my-report.pdf"

# Bad — will silently fail delivery
output_path = "/tmp/my-report.pdf"
```

Ensure the directory exists before writing:

```bash
mkdir -p /tmp/hermes
```

## Rule 2: Use MEDIA: syntax in reply text (not the message tool)

### In a parent / main session

Include the MEDIA: reference directly in your reply text:

```
Here's the report. MEDIA:/tmp/hermes/my-report.pdf
```

Hermes will intercept the `MEDIA:` prefix and attach the file automatically.

### In a sub-agent (isolated session)

Sub-agents **do not have the Slack plugin loaded** — calling `message(channel=slack, ...)` throws `Channel is unavailable: slack`. Sub-agents cannot send Slack messages directly.

**Correct pattern for sub-agents:**

1. Save the file to `/tmp/hermes/filename.ext`
2. End the sub-agent's reply with a `MEDIA:` line pointing to that path
3. The **parent session** picks up the sub-agent's output and forwards it (including the MEDIA: reference) to Slack

```
# Sub-agent reply (last line)
Report complete. MEDIA:/tmp/hermes/output.pdf
```

The parent then echoes or forwards that line — it does not need to re-read or re-generate the file.

## Checklist before delivering a file

```
□ Output path starts with /tmp/hermes/, ~/.hermes/media/, or ~/.hermes/
□ Directory exists (mkdir -p if needed)
□ Delivery uses MEDIA: in reply text, not message(channel=slack)
□ If sub-agent: parent session is responsible for the final Slack send
```

## Common failure modes

| Symptom | Cause | Fix |
|---|---|---|
| File exists but not attached | Saved to `/tmp/` not `/tmp/hermes/` | Move file or save to correct path |
| `Channel is unavailable: slack` | Sub-agent calling `message` tool | Remove message() call; use MEDIA: in reply text |
| Parent never sends the file | Sub-agent reply not surfaced to parent | Parent must include MEDIA: reference when reporting results |
