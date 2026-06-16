---
name: budget-approval-email
description: Draft and save a contractor budget approval email for Chris Abad to send to Roshni (VP), CC'ing Alyssa Hartigan and Ashish. Use when Chris asks to request budget approval for a contractor engagement, new project scope, or contractor spend. Always puts the draft in Gmail drafts — never sends directly. Requires Notion links for the project brief, project plan, and budget proposal.
version: 1.0.0
audience: shared
agents: [otis]
---
# Budget Approval Email

## Pattern

Budget approval emails follow a consistent, short format established from past approvals (Wit's End, Hub & Growth UX). Do not deviate without a reason.

**Structure:**
1. One-line intro naming the project and initiative it supports
2. Bulleted list: Design Project Brief, Project Plan, Budget Proposal (each as a Notion link)
3. One line: total budget request + expected contractor spend + rate/hours
4. One-line ask: "Do we have approval to proceed and issue the contractor agreement?"

See `references/examples.md` for the canonical past examples.

## Contacts

See `references/contacts.md` for current email addresses (Roshni, Alyssa, Ashish). Always verify Roshni's domain — it changed from volleygames.com to weekend.com at the Feb 2026 rebrand.

## Notion Content Updates (Important)

When updating Notion page content via mcporter, always use `--args <json>` instead of `key:value` args. The `key:value` parser breaks on multi-line content (newlines act as argument delimiters). Use `spawnSync` with:

```javascript
const argsJson = JSON.stringify({ page_id: '...', command: 'replace_content', new_str: content });
spawnSync('mcporter', ['call', 'notion.notion-update-page', '--args', argsJson], {...});
```

## Workflow

1. Confirm you have all three Notion links: Design Project Brief, Project Plan, Budget Proposal
2. Read `references/examples.md` for exact tone and length calibration
3. Draft the email body (keep it under 10 lines)
4. Save to Gmail drafts — never send directly:
   ```bash
   source ~/.zshrc 2>/dev/null
   export GOG_KEYRING_PASSWORD="${GOG_KEYRING_PASSWORD:-gog-2026}"
   gog gmail drafts create \
     --account chris.abad@volleygames.com \
     --to "roshni@weekend.com" \
     --cc "alyssa.hartigan@volleygames.com, ashish@volleygames.com" \
     --subject "New Project Proposal — [Project Name]" \
     --body "$BODY" \
     -j
   ```
5. Report the draft ID and confirm it's in Gmail drafts, ready to review and send
