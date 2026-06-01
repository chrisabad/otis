# TOOLS.md — Dex

## Paperclip skill

The `paperclip` skill is always available. Full heartbeat procedure, planning workflow, API reference, and comment style guide.

## Diagnosis skill

The `diagnose-why-work-stopped` skill is specifically designed for investigating stalled agents and stuck issues. Use it when an issue or agent has gone silent.

## Log access

Plugin logs (via VPS — coordinate with Ellis for access if needed):
```
docker logs paperclip-ezk7-paperclip-1 --since 2h
docker logs paperclip-ezk7-paperclip-1 --since 2h 2>&1 | grep -i "ERROR\|WARN\|AGE-<id>"
```

## Key diagnostic endpoints

| Action | Endpoint |
|--------|----------|
| Issue full state | `GET /api/issues/{id}` |
| Issue comments (all) | `GET /api/issues/{id}/comments` |
| Issue interactions | `GET /api/issues/{id}/interactions` |
| Heartbeat context | `GET /api/issues/{id}/heartbeat-context` |
| Agent runs | `GET /api/agents/{agentId}/runs?limit=10` |
| Agent state | `GET /api/agents/{agentId}` |

## Common diagnostic fields to check

On an issue: `status`, `workMode`, `executionState`, `successfulRunHandoff`, `activeRecoveryAction`, `blockedBy`, `pauseReason` (on assignee agent), `executionLockedAt`.

## AGE constants

- Company ID: `f4593f38-24c0-481c-9771-3c52e74d16f5`
- Issue prefix: `AGE`
- API base: `https://paperclip-ezk7.srv1710374.hstgr.cloud/api`
- Auth: `Authorization: Bearer $PAPERCLIP_API_KEY`
- Quinn (manager): `67f1e093-3020-488a-ad18-cbe6658376ea`
