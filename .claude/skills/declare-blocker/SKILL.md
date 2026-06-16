---
name: declare-blocker
description: "Structured skill for blocking a PaperClip issue. Replaces raw label PATCH calls with validated, role-gated blocker declarations. Enforces approval tier rules in code, not inference. Use instead of directly PATCHing labels or status to blocked. Supports four types — needs-approval (orchestrator only), external (any agent), duplicate (any agent, cancels directly), issue-dependency (any agent, uses native blocker relation)."
version: 1.0.0
audience: shared
---
# declare-blocker

Use this skill whenever you need to block a PaperClip issue. **Never PATCH `blocked:needs-approval` or `blocked:external` labels directly** — use this skill to ensure validation and role enforcement. For `issue-dependency`, use the **native blocker relation** (not labels).

## Invocation Forms

```
declare-blocker --issue AGE-XXX --type needs-approval --reason "..."
declare-blocker --issue AGE-XXX --type external --reason "..."
declare-blocker --issue AGE-XXX --type duplicate --original AGE-YYY
declare-blocker --issue AGE-XXX --type issue-dependency --blocks-on AGE-YYY
```

---

## Role Gate

| Caller Role | needs-approval | external | duplicate | issue-dependency |
|-------------|---------------|----------|-----------|-----------------|
| Orchestrator (Juno) | ✅ allowed | ✅ allowed | ✅ allowed | ✅ allowed |
| Dispatch (Reed) | ❌ **blocked** | ✅ allowed | ✅ allowed | ✅ allowed |
| Implementer (Axel) | ❌ **blocked** | ✅ allowed | ✅ allowed | ✅ allowed |
| Reviewer (Quinn) | ❌ **blocked** | ✅ allowed | ✅ allowed | ✅ allowed |
| Any other agent | ❌ **blocked** | ✅ allowed | ✅ allowed | ✅ allowed |

**If a non-orchestrator calls `--type needs-approval`:** stop, post a comment on the issue explaining why it needs approval, and assign or @mention Juno to handle it instead. Do NOT apply the label.

---

## Required Environment

```bash
source /home/hermes/.hermes/workspace/agents/<your-agent>/.env
# Must have: PAPERCLIP_API_KEY, PAPERCLIP_RUN_ID
```

**Label UUIDs (AGE company `0f6e2b9b-12b2-4306-9798-16325c788e6f`):**
- `blocked:needs-approval` → `3aec5443-7eff-473a-8b6a-ca54c1b4c8f5`
- `blocked:external` → `c05b89cf-0fd4-44eb-847d-ca10b6883c65`

**Note:** `blocked:issue-*` labels are no longer used for `issue-dependency` — the native blocker relation replaces them (see below).

---

## Type: `needs-approval` (Orchestrator Only)

**Who:** Juno (`cdebff99-6651-42e6-8a81-b6b493202a3e`) only.

**Pre-flight — validate description sections:**

Before applying the label, GET the issue and verify these sections exist in the description:

```
## What approval is needed
## Why it cannot proceed without approval
## Options / recommendation
```

If any section is missing: post a comment listing the missing sections, do NOT apply the label, and exit.

**Steps (Juno only):**

```bash
# 1. Verify description sections exist (see above)

# 2. Apply the label first (plugin requires label before blocked status)
curl -s -X PATCH "http://127.0.0.1:3101/api/issues/<ISSUE_ID>" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY" \
  -H "X-Paperclip-Run-Id: $PAPERCLIP_RUN_ID" \
  -H "Content-Type: application/json" \
  -d '{"labelIds":["f9152e7f-cf96-445b-93c5-a730d57da4b4"]}'

# 3. Set status to blocked
curl -s -X PATCH "http://127.0.0.1:3101/api/issues/<ISSUE_ID>" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY" \
  -H "X-Paperclip-Run-Id: $PAPERCLIP_RUN_ID" \
  -H "Content-Type: application/json" \
  -d '{"status":"blocked"}'

# 4. Post comment explaining what's needed
curl -s -X POST "http://127.0.0.1:3101/api/issues/<ISSUE_ID>/comments" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY" \
  -H "X-Paperclip-Run-Id: $PAPERCLIP_RUN_ID" \
  -H "Content-Type: application/json" \
  -d '{"body":"Blocked: needs-approval\n\nReason: <your reason>\n\nRouting to @Chris for decision."}'
```

**If you are NOT Juno:** post this comment instead and stop:

```
Approval needed: this issue requires a decision before proceeding.
Reason: <your reason>

Routing to @Juno — please evaluate and apply blocked:needs-approval if appropriate,
or provide a decision so work can continue.
```

Then assign to Juno: `{"assigneeAgentId":"cdebff99-6651-42e6-8a81-b6b493202a3e"}`.

---

## Type: `external` (Any Agent)

Use when blocked on something outside the system (third-party API, waiting on Chris for non-approval input, external vendor).

```bash
# 1. Apply blocked:external label
curl -s -X PATCH "http://127.0.0.1:3101/api/issues/<ISSUE_ID>" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY" \
  -H "X-Paperclip-Run-Id: $PAPERCLIP_RUN_ID" \
  -H "Content-Type: application/json" \
  -d '{"labelIds":["75ef9fc2-7d2e-48c8-aa2f-e7330d57e6d1"]}'

# 2. Set status to blocked
curl -s -X PATCH "http://127.0.0.1:3101/api/issues/<ISSUE_ID>" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY" \
  -H "X-Paperclip-Run-Id: $PAPERCLIP_RUN_ID" \
  -H "Content-Type: application/json" \
  -d '{"status":"blocked"}'

# 3. Post comment describing the external dependency
curl -s -X POST "http://127.0.0.1:3101/api/issues/<ISSUE_ID>/comments" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY" \
  -H "X-Paperclip-Run-Id: $PAPERCLIP_RUN_ID" \
  -H "Content-Type: application/json" \
  -d '{"body":"Blocked: external dependency\n\nReason: <your reason>\n\nCannot proceed until resolved."}'
```

---

## Type: `duplicate` (Any Agent)

Use when an issue is a clear duplicate of an existing open issue. No approval required — cancels directly.

**Before cancelling:** confirm the original issue is open (not done/cancelled).

```bash
# 1. Post comment linking to original
curl -s -X POST "http://127.0.0.1:3101/api/issues/<ISSUE_ID>/comments" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY" \
  -H "X-Paperclip-Run-Id: $PAPERCLIP_RUN_ID" \
  -H "Content-Type: application/json" \
  -d '{"body":"Closing as duplicate of <ORIGINAL_IDENTIFIER> (<ORIGINAL_ID>).\n\nOriginal issue is still open and covers the same objective."}'

# 2. Cancel the duplicate
curl -s -X PATCH "http://127.0.0.1:3101/api/issues/<ISSUE_ID>" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY" \
  -H "X-Paperclip-Run-Id: $PAPERCLIP_RUN_ID" \
  -H "Content-Type: application/json" \
  -d '{"status":"cancelled","comment":"Duplicate of <ORIGINAL_IDENTIFIER>"}'
```

**When in doubt:** if you're unsure it's truly a duplicate, link the issues with a comment but leave both open. Only cancel when the duplicate is clear.

---

## Type: `issue-dependency` (Any Agent)

Use when this issue cannot proceed until another PaperClip issue is completed. Uses the **native blocker relation** — no labels required.

**How it works:** The native relation is tracked by Paperclip and can be queried via `GET /api/issues/{id}/blockers`. The plugin auto-unblocks when the blocking issue transitions to `done`.

### Step 1: Look up the blocking issue UUID

If you only have an identifier (e.g., `AGE-123`), look up its UUID:

```bash
paperclipai issue get AGE-123 --json | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])"
```

### Step 2: Register the native blocker relation

```bash
# POST to the BLOCKED issue (the one that is waiting), with the UUID of the blocker
curl -s -X POST "http://127.0.0.1:3101/api/issues/<BLOCKED_ISSUE_ID>/blockers" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY" \
  -H "X-Paperclip-Run-Id: $PAPERCLIP_RUN_ID" \
  -H "Content-Type: application/json" \
  -d '{"blockedByIssueId":"<BLOCKING_ISSUE_UUID>"}'
```

### Step 3: Set status to blocked

```bash
curl -s -X PATCH "http://127.0.0.1:3101/api/issues/<BLOCKED_ISSUE_ID>" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY" \
  -H "X-Paperclip-Run-Id: $PAPERCLIP_RUN_ID" \
  -H "Content-Type: application/json" \
  -d '{"status":"blocked"}'
```

### Step 4: Post comment describing the dependency

```bash
curl -s -X POST "http://127.0.0.1:3101/api/issues/<BLOCKED_ISSUE_ID>/comments" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY" \
  -H "X-Paperclip-Run-Id: $PAPERCLIP_RUN_ID" \
  -H "Content-Type: application/json" \
  -d '{"body":"Blocked: waiting on <DEPENDENCY_IDENTIFIER> to complete.\n\nReason: <why this issue cannot proceed without it>.\n\nNative blocker relation registered. Will auto-unblock when dependency is done."}'
```

### Removing a blocker (when dependency resolves early)

```bash
curl -s -X DELETE "http://127.0.0.1:3101/api/issues/<BLOCKED_ISSUE_ID>/blockers/<BLOCKING_ISSUE_UUID>" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY"
```

### Listing current blockers on an issue

```bash
curl -s "http://127.0.0.1:3101/api/issues/<ISSUE_ID>/blockers" \
  -H "Authorization: Bearer $PAPERCLIP_API_KEY"
```

**After the dependency is done:** the plugin removes the blocker relation and moves the issue back to `todo` automatically. Dispatch (Reed) will validate the unblock on next sweep.

---

## Error Messages

| Situation | What to do |
|-----------|-----------|
| Called `needs-approval` as non-orchestrator | Post escalation comment (see above), assign to Juno, stop |
| Description missing required sections | Post comment listing missing sections, stop |
| Original issue for duplicate is already done/cancelled | Use `external` or file a new issue instead |
| Dependency issue for `issue-dependency` is already done | Proceed without blocking — the dependency is resolved |
| `POST /blockers` returns 404 | Check that `BLOCKED_ISSUE_ID` is a valid UUID (not an identifier like AGE-123) |
| `POST /blockers` returns 409 | The blocker relation already exists — no action needed |
| API returns error on label PATCH | Post comment describing the blocker reason, do not retry in a loop — report in issue |

---

## What NOT to Do

- Do NOT PATCH `labelIds` with `blocked:needs-approval` directly as a non-orchestrator
- Do NOT set `status: blocked` without setting the label first (plugin will revert it) — except for `issue-dependency` where the native blocker relation is sufficient
- Do NOT use `blocked:issue-*` labels for `issue-dependency` — the native relation is the correct primitive
- Do NOT cancel issues without posting a comment first
- Do NOT use `needs-approval` for routine decisions you can make yourself
- Do NOT loop on label re-application if the plugin reverts it — that's the signal to use this skill correctly
- Do NOT use port 3100 — Paperclip runs on port **3101**
