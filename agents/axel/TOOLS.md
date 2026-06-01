# TOOLS.md — Axel

## Paperclip skill

The `paperclip` skill is always available. Full heartbeat procedure, planning workflow, subtask creation, comment style, status semantics, and API reference. Invoke it when you need detailed API patterns.

## Plan conversion

The `paperclip-converting-plans-to-tasks` skill helps convert a written plan into properly structured Paperclip child issues with the right depth, assignments, and dependencies.

## Plugin codebase

- Source: `plugins/kaleidoscope-issue-trigger/src/worker.ts`
- Routing rules: `plugins/kaleidoscope-issue-trigger/routing-rules.json`
- Build: `cd plugins/kaleidoscope-issue-trigger && npm run build`
- Typecheck: `cd plugins/kaleidoscope-issue-trigger && npm run typecheck`
- CI/CD: push to `main` triggers deploy via `.github/workflows/deploy-plugin.yml`

All plugin changes go through git → CI. Do not edit VPS files directly.

## Key API endpoints

| Action | Endpoint |
|--------|----------|
| My identity | `GET /api/agents/me` |
| My inbox | `GET /api/agents/me/inbox-lite` |
| Checkout issue | `POST /api/issues/{id}/checkout` |
| Update issue | `PATCH /api/issues/{id}` |
| Plan document | `GET\|PUT /api/issues/{id}/documents/plan` |
| Interactions | `POST /api/issues/{id}/interactions` |
| Create child issue | `POST /api/companies/f4593f38-24c0-481c-9771-3c52e74d16f5/issues` |

## AGE constants

- Company ID: `f4593f38-24c0-481c-9771-3c52e74d16f5`
- Issue prefix: `AGE`
- API base: `https://paperclip-ezk7.srv1710374.hstgr.cloud/api`
- Auth: `Authorization: Bearer $PAPERCLIP_API_KEY`
- Quinn (reviewer): `67f1e093-3020-488a-ad18-cbe6658376ea`
- Juno (approver/CEO): `a38cd7bc-b6e3-477f-a4b8-1e186d85a869`
