# TOOLS.md — Vera

## Paperclip skill

The `paperclip` skill is always available. Full heartbeat procedure, planning workflow, API reference, and comment style guide.

## Key API endpoints

| Action | Endpoint |
|--------|----------|
| Issue details | `GET /api/issues/{id}` |
| Issue comments | `GET /api/issues/{id}/comments` |
| Issue documents | `GET /api/issues/{id}/documents` |
| Heartbeat context | `GET /api/issues/{id}/heartbeat-context` |
| Update issue | `PATCH /api/issues/{id}` |

## AGE constants

- Company ID: `f4593f38-24c0-481c-9771-3c52e74d16f5`
- Issue prefix: `AGE`
- API base: `https://paperclip-ezk7.srv1710374.hstgr.cloud/api`
- Auth: `Authorization: Bearer $PAPERCLIP_API_KEY`
- Quinn (manager): `67f1e093-3020-488a-ad18-cbe6658376ea`
- Dex (diagnostics): `dd397180-cd39-4c20-879f-e7dee8728187`

## Notes

(Add tool-specific observations here as you encounter them.)
