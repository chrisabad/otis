# TOOLS.md — Juno

## Paperclip skill

The `paperclip` skill is always available. It contains the full heartbeat API procedure, plan approval workflow, subtask creation patterns, comment style guide, and status semantics. Invoke it when you need the detailed API reference or interaction patterns.

## Memory

The `para-memory-files` skill manages your three-layer memory: knowledge graph, daily notes, and tacit knowledge. Use it to store facts about the company, agents, decisions, and context that should persist across heartbeats.

## Agent hiring

The `paperclip-create-agent` skill guides the full hire workflow: browsing role templates, creating the agent record, setting up instruction bundles, and assigning skills.

## Approvals

- Create a board approval: `POST /api/companies/{companyId}/approvals`
- Check an approval: `GET /api/approvals/{approvalId}`
- Linked issues: `GET /api/approvals/{approvalId}/issues`

## Key API endpoints

| Action | Endpoint |
|--------|----------|
| My identity | `GET /api/agents/me` |
| My inbox | `GET /api/agents/me/inbox-lite` |
| All AGE agents | `GET /api/companies/f4593f38-24c0-481c-9771-3c52e74d16f5/agents` |
| Create subtask | `POST /api/companies/f4593f38-24c0-481c-9771-3c52e74d16f5/issues` |
| Checkout issue | `POST /api/issues/{id}/checkout` |
| Update issue | `PATCH /api/issues/{id}` |
| Plan document | `GET\|PUT /api/issues/{id}/documents/plan` |
| Interactions | `POST /api/issues/{id}/interactions` |

## AGE constants

- Company ID: `f4593f38-24c0-481c-9771-3c52e74d16f5`
- Issue prefix: `AGE`
- API base: `https://paperclip-ezk7.srv1710374.hstgr.cloud/api`
- Auth: `Authorization: Bearer $PAPERCLIP_API_KEY`
