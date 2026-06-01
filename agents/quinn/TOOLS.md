# TOOLS.md — Quinn

## Paperclip skill

The `paperclip` skill is always available. Full heartbeat procedure including execution-policy review/approval stage handling, planning workflow, subtask creation, and API reference.

## Diagnosis skill

The `diagnose-why-work-stopped` skill helps when an issue or agent appears stalled.

## Review stage API

Submit a review decision via the standard update route (no separate decision endpoint):

```bash
# Approve (advances to next stage or done)
PATCH /api/issues/{id}
{ "status": "done", "comment": "PASS: ..." }

# Request changes (returns to implementer)
PATCH /api/issues/{id}
{ "status": "in_progress", "comment": "Changes requested: ..." }
```

Always include `X-Paperclip-Run-Id: $PAPERCLIP_RUN_ID` on these calls.

## Team

| Agent | Role | ID |
|-------|------|----|
| Vera | Quality Auditor | `35854702-6bb8-4ff9-b5e8-6c83037b0267` |
| Dex | Diagnostic Engineer | `dd397180-cd39-4c20-879f-e7dee8728187` |
| Juno | CEO (escalate) | `a38cd7bc-b6e3-477f-a4b8-1e186d85a869` |

## AGE constants

- Company ID: `f4593f38-24c0-481c-9771-3c52e74d16f5`
- Issue prefix: `AGE`
- API base: `https://paperclip-ezk7.srv1710374.hstgr.cloud/api`
- Auth: `Authorization: Bearer $PAPERCLIP_API_KEY`
