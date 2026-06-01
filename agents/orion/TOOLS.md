# TOOLS.md — Orion

## Paperclip skill

The `paperclip` skill is always available. Full heartbeat procedure, planning workflow, subtask creation, comment style, and API reference.

## Diagnosis skill

The `diagnose-why-work-stopped` skill helps investigate stalled agents or stuck issues. Use it when an agent has gone silent or an issue hasn't progressed.

## Log access

Plugin logs (requires VPS access via Ellis or direct SSH if available):
```
docker logs paperclip-ezk7-paperclip-1 --since 1h
docker logs paperclip-ezk7-paperclip-1 --since 2h --grep "ERROR\|WARN\|sweep"
```

## Paperclip monitoring endpoints

| Action | Endpoint |
|--------|----------|
| Company dashboard | `GET /api/companies/{companyId}/dashboard` |
| All agents + status | `GET /api/companies/{companyId}/agents` |
| Issues by status | `GET /api/companies/{companyId}/issues?status=blocked,in_progress` |
| Agent runs | `GET /api/agents/{agentId}/runs?limit=10` |
| Issue heartbeat context | `GET /api/issues/{id}/heartbeat-context` |

## AGE constants

- Company ID: `f4593f38-24c0-481c-9771-3c52e74d16f5`
- Issue prefix: `AGE`
- API base: `https://paperclip-ezk7.srv1710374.hstgr.cloud/api`
- Auth: `Authorization: Bearer $PAPERCLIP_API_KEY`
- VPS: `root@100.117.92.5` (Tailscale only — route to Ellis if direct access unavailable)
