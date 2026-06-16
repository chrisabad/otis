---
name: email-triage
description: Email triage and management across multiple Google accounts using the gog CLI. Use when checking email, searching messages, drafting replies, finding urgent items, or managing inboxes across Chris's accounts; do not send emails without approval.
version: 1.1.0
audience: shared
---
# email-triage

Triage and manage emails across Chris Abad's Google accounts using the gog CLI.

## Tool

- **Binary:** `/usr/local/bin/gog`
- **Environment:** `GOG_KEYRING_PASSWORD` must be set. Each triage-running agent has it in their `.env`. The setup step below also exports a safe fallback so the skill works even from a fresh shell.
- **Setup (Paperclip-spawned and interactive both):**
  ```bash
  # Source agent .env if present (Paperclip-spawned agents)
  for env_file in "$HOME/.hermes/profiles/$AGENT_NAME/.env" \
                  "$HOME/.hermes/profiles/otis/.env"; do
    [ -f "$env_file" ] && set -a && . "$env_file" && set +a && break
  done
  # Fallback for interactive shells / unknown $AGENT_NAME
  export GOG_KEYRING_PASSWORD="${GOG_KEYRING_PASSWORD:-gog-2026}"
  ```
  Why: gog uses an encrypted `file` keyring backend. Without this env var, `gog` fails non-interactively with `no TTY available for keyring file backend password prompt`. Sourcing `~/.zshrc` does NOT work for Paperclip-spawned agent processes.

## Account Parameterization

This skill is account-agnostic. Always pass `--account <email>` explicitly. Never hardcode an account.

**Supported accounts and per-business owner agents:**

| Account | Context | Domain | Owner agent |
|---------|---------|--------|-------------|
| `chris.abad@weekend.com` | Work — Weekend (primary) | WEE | otis |
| `chris@kaleidoscope.studio` | Kaleidoscope consulting | KAL | lev |
| `chrisabad@diacriticmining.com` | Diacritic Mining (winding down) | DIA | lev |
| `chrisabad@gmail.com` | Personal / Pixelated Path | PIX | otis |

Each owner agent runs hourly via a Paperclip routine. When called for a specific context, use only the relevant account(s). Studio Method and Font Replacer do not have dedicated inboxes yet — no triage routines for those businesses.

**Example — WEE triage only:**
```bash
ACCOUNT="chris.abad@weekend.com"
gog gmail list "in:inbox" --account "$ACCOUNT" -j --limit 50 --no-input
```

**Example — KAL triage only:**
```bash
ACCOUNT="chris@kaleidoscope.studio"
gog gmail list "in:inbox" --account "$ACCOUNT" -j --limit 50 --no-input
```

## Inbox Protocol

**Inbox = backlog queue. Goal: inbox zero.**
**Starred = Chris's personal todo queue. NEVER touch starred items.**

- Inbox items are processed and acted on by the triage agent.
- Starred items belong to Chris. The agent does not add stars, remove stars, or act on starred items.
- The only source of truth for triage is `in:inbox`. Do not query or modify `is:starred`.

## Usage Patterns

### List inbox messages

```bash
gog gmail list "in:inbox" --account <email> -j --limit 50 --no-input
```

### Read a message (summary)

```bash
gog gmail read <message_id> --account <email> --no-input
```

### Read a message (full content, for classification)

```bash
gog gmail read <message_id> --account <email> --full --no-input
```

## Triage Decision Tree

Apply these rules to every inbox thread, in order. First match wins.

### Rule 0 — Already Starred → SKIP

If the thread is starred: **do nothing**. It is Chris's todo queue. Move on.

```bash
# Check if starred: look for STARRED in labelIds from the message metadata
# If starred: skip this thread entirely
```

### Rule 1 — Marketing / Bulk (List-Unsubscribe header present) → UNSUBSCRIBE + ARCHIVE

**Signal:** Message headers contain `List-Unsubscribe` or `List-Unsubscribe-Post`, OR the sender/domain is a known marketing sender.

**Action:**
1. **Always attempt unsubscribe first** — Chris explicitly wants marketing emails unsubscribed, not just archived. Use the Puppeteer unsubscribe flow below. If unsubscribe succeeds, the sender should stop emailing entirely.
2. If unsubscribe fails, log the sender to `suppressed-senders.md` so future runs auto-archive without re-evaluation.
3. Archive the thread regardless of unsubscribe outcome

```bash
gog gmail thread modify <threadId> --remove INBOX --account <email> --no-input
```

### Rule 2 — Noise → ARCHIVE ONLY

**Noise signals (any of the following):**
- Automated notifications (GitHub, Jira, Linear, Slack digest, app alerts)
- Newsletters and blog digests (even if not bulk-flagged)
- Shipping/order updates (receipts, tracking numbers, delivery confirmations)
- Social media alerts (LinkedIn activity, Twitter/X mentions, follower updates)
- FYI-only messages with no question, request, or deadline directed at Chris
- Calendar invites Chris already accepted (duplicate notification)
- System-generated emails (no-reply senders, automated billing receipts)

**Action:** Archive only. No star.

```bash
gog gmail thread modify <threadId> --remove INBOX --account <email> --no-input
```

### Rule 3 — Action Item → STAR + ESCALATE ONLY IF AGENT-ACTIONABLE

**Action signals (any of the following directed at Chris):**
- Direct question to Chris ("Can you...", "Do you...", "What do you think...", "Are you...?")
- Explicit request ("Please...", "I need you to...", "Could you...")
- Deadline language ("by EOD", "by Friday", "before the meeting", "ASAP")
- Approval or sign-off needed
- Message from a real person Chris has a relationship with (even if no explicit ask)
- Reply needed to maintain a relationship or keep a thread moving

**⚠️ Critical distinction — attention flags vs. agent-actionable items:**

| Category | Action | Rationale |
|----------|--------|-----------|
| Chris needs to read/decide/respond personally | **Star** the email, archive, do NOT create a Paperclip issue | "Please read this" issues become `stranded_assigned_issue` loops — agents can't act on them |
| An agent can actually DO something (draft reply, schedule meeting, gather info, make a config change) | **Star** the email + create a Paperclip issue describing the agent action, not just "email needs attention" | Issues must have a concrete agent-executable task or they block |

**The antipattern (AGE-14253):** Filing Paperclip issues just to flag "this email needs Chris's attention" produces a `stranded_assigned_issue` loop. The routine runs hourly, creates blocked issues that no agent can resolve, and they pile up indefinitely. The starred inbox + notification service are the correct channels for "Chris needs to see this." Paperclip issues are only for work an agent can autonomously execute.

**For items needing Chris's attention (not agent-actionable):**
1. Star the email (so it appears in Chris's starred queue and notification service picks it up)
2. Archive the thread

```bash
gog gmail thread modify <threadId> --add STARRED --remove INBOX --account <email> --no-input
```

**For agent-actionable items:**
1. Star the email (Chris still needs awareness)
2. Create a Paperclip issue describing the *agent action*, not just the email

```bash
gog gmail thread modify <threadId> --add STARRED --remove INBOX --account <email> --no-input
```

Then file a PaperClip issue with a concrete action description (see Escalation Flow below).

### Rule 4 — Default → ARCHIVE

If none of the above rules match: archive. When in doubt, archive (never delete).

```bash
gog gmail thread modify <threadId> --remove INBOX --account <email> --no-input
```

---

## Unsubscribe Flow (Marketing/Bulk Emails)

### Primary: Puppeteer

Use the local Puppeteer unsubscribe script when available:

```bash
# Extract List-Unsubscribe URL from message headers
# Then run:
node /home/hermes/.hermes/workspace/tools/unsubscribe.js "<unsubscribe_url>"
```

**Success:** Script exits 0 → archive the thread.
**Failure (exit non-zero, timeout, or script missing):** Fall through to fallback.

### Fallback: Archive + Suppress

If Puppeteer fails or the unsubscribe URL is not accessible:

1. Archive the thread (remove from inbox)
2. Log the sender to `memory/suppressed-senders.md` for future auto-archive:

```bash
echo "$(date +%Y-%m-%d) | <sender_email> | <reason>" >> \
  /home/hermes/.hermes/workspace/agents/sage/memory/suppressed-senders.md
```

3. On future runs, check `suppressed-senders.md` before triaging — auto-archive any message from a suppressed sender without re-evaluating. Use exec only — never use `Read`, `Edit`, or `Glob` tools for this file:

```bash
# Check if sender is suppressed (returns 0 if found)
grep -q "<sender_email>" /home/hermes/.hermes/workspace/agents/sage/memory/suppressed-senders.md 2>/dev/null && echo "SUPPRESSED" || echo "NOT_SUPPRESSED"
```

**Idempotency note:** Archiving an already-archived email is a no-op. Running the unsubscribe flow twice on the same message is safe.

---

## Action Item Escalation Flow

**Only create PaperClip issues for agent-actionable items** — emails where an agent can autonomously perform a concrete task (draft reply, schedule meeting, research, config change, file something). Do NOT create issues just to flag "Chris needs to read this" — that produces `stranded_assigned_issue` loops (see AGE-14253 antipattern in Rule 3).

When an email has an agent-actionable task:

```bash
curl -s -X POST "http://127.0.0.1:3101/api/companies/dfd450ac-34c2-40a4-b3bc-4e4df9b59cea/issues" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY" \
  -H "X-Paperclip-Run-Id: $PAPERCLIP_RUN_ID" \
  -d "{
    \"title\": \"[Agent] <concrete action> — <email subject context>\",
    \"description\": \"**From:** <sender>\\n**Account:** <account>\\n**Subject:** <subject>\\n**Message ID:** <id>\\n\\n**Summary:** <1-2 sentence summary>\\n\\n**Agent action:** <specific thing the agent should DO>\\n\\n**Acceptance criteria:** <how to verify the action is complete>\",
    \"status\": \"todo\",
    \"priority\": \"medium\",
    \"assigneeAgentId\": \"<appropriate-agent-id-for-the-task>\"
  }"
```

- Assign to the agent whose role matches the task, not always Juno. Juno can't execute tasks — route to the implementer who can.
- For urgent action items (deadline within 24h, from Roshni/Max/Dave): set priority to `high`
- Title must describe the **action**, not the email: `[Sage] Draft reply to X about Y` ✅ vs `Email action item: Y` ❌

---

## Triage Workflow

### Steps

1. **Setup environment**
   ```bash
   source ~/.zshrc 2>/dev/null
   export GOG_KEYRING_PASSWORD="${GOG_KEYRING_PASSWORD:-gog-2026}"
   ```

2. **List inbox** for the target account(s)
   ```bash
   gog gmail list "in:inbox" --account <email> -j --limit 100 --no-input
   ```

3. **For each thread:** apply the Decision Tree (Rules 0–4) in order

4. **Check suppressed senders** before classifying: auto-archive any message from a known suppressed sender. Use exec+grep — not `Read`, `Edit`, or `Glob`:
   ```bash
   grep -q "<sender_email>" /home/hermes/.hermes/workspace/agents/sage/memory/suppressed-senders.md 2>/dev/null && echo "SUPPRESSED"
   ```

5. **Completion signal:** inbox is empty for the target account(s)

6. **Report:** summarize actions taken (archived N, escalated N to Juno, unsubscribed N)

### Idempotency

Running the full triage workflow twice on the same inbox is safe:
- Already-archived threads are not in the inbox (no-op)
- Already-filed PaperClip issues will be deduped by Juno on pickup
- Suppressed senders list is append-only (no harm in re-checking)

## Priority Signals

High-priority messages typically include:

- **Support requests** — especially Font Replacer support (Kaleidoscope product)
- **Billing/payment issues** — time-sensitive financial matters
- **Deadlines** — messages with explicit time constraints
- **Ongoing conversations** — replies to threads Chris is actively engaged in
- **Executive/leadership emails** — from Roshni, Max, Dave, or key stakeholders at Weekend
- **Client deliverables** — Kaleidoscope project milestones

## Gmail Search Operators

Use standard Gmail search syntax for precise queries:

- `from:sender@example.com` - Messages from specific sender
- `to:recipient@example.com` - Messages to specific recipient
- `subject:"exact phrase"` - Messages with subject containing phrase
- `is:unread` - Unread messages only
- `is:starred` - Starred messages
- `newer_than:2d` - Messages from last 2 days (also: h=hours, m=months, y=years)
- `older_than:1w` - Messages older than 1 week
- `has:attachment` - Messages with attachments
- `label:inbox` - Messages in inbox
- Combine with AND/OR: `from:support@example.com newer_than:1d`

## Safety Rules

- **NEVER send or reply to emails without Chris's explicit approval**
- **NEVER permanently delete emails**
- **NEVER touch starred emails** — starred = Chris's personal todo queue (Rule 0); no starring, no unstarring, ever
- Always present drafts for review before sending
- When Chris asks to "reply", draft the response and ask for confirmation

## Related Skills

The **gog** skill provides detailed documentation for the gog CLI tool and its capabilities.
This skill focuses specifically on the email triage workflow and Chris's account-specific context.

## Examples

### Full triage sweep — all accounts

```bash
export GOG_KEYRING_PASSWORD="${GOG_KEYRING_PASSWORD:-gog-2026}"

for account in chris.abad@weekend.com chris@kaleidoscope.studio chrisabad@gmail.com chrisabad@diacriticmining.com; do
  echo "=== $account (inbox) ==="
  gog gmail list "in:inbox" --account "$account" -j --limit 100 --no-input
done
```

Do NOT query `is:starred` — starred items are Chris's queue and must not be touched.

### WEE triage only (Weekend account)

```bash
export GOG_KEYRING_PASSWORD="${GOG_KEYRING_PASSWORD:-gog-2026}"
gog gmail list "in:inbox" --account "chris.abad@weekend.com" -j --limit 100 --no-input
```

### KAL triage only (Kaleidoscope account)

```bash
export GOG_KEYRING_PASSWORD="${GOG_KEYRING_PASSWORD:-gog-2026}"
gog gmail list "in:inbox" --account "chris@kaleidoscope.studio" -j --limit 100 --no-input
```

### Find Font Replacer support requests

```bash
gog gmail search 'subject:"font replacer" OR subject:support' --account chris@kaleidoscope.studio --max 20 --json --no-input
```

### Check Weekend emails from last 24 hours

```bash
gog gmail list "in:inbox newer_than:1d" --account chris.abad@weekend.com -j --limit 25 --no-input
```

### Archive a thread

```bash
gog gmail thread modify <threadId> --remove INBOX --account <email> --no-input
```

### Archive + unstar a thread (if it was accidentally starred)

```bash
# NOTE: Only use this if Juno or Chris explicitly requests it — never auto-unstar
gog gmail thread modify <threadId> --remove STARRED,INBOX --account <email> --no-input
```

## Notes

- The gog CLI requires authentication setup per account (handled via keyring)
- JSON output is preferred for programmatic parsing
- Use `--no-input` flag to prevent interactive prompts
- Message IDs from search results can be passed to `gmail read` commands
- Full message content (`--full`) includes headers, body, and metadata
- Account was rebranded from `volleygames.com` → `weekend.com` on 2026-03-12; use `weekend.com`
- `is:starred` is never queried during triage — starred = Chris's personal queue, untouched
