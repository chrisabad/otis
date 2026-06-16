---
name: litellm-proxy
description: >
  Manage a live LiteLLM proxy — CRUD operations for models, API keys, agents,
  MCP servers, organizations, teams, users, and usage reporting. Use when you
  need to add, update, delete, or list any resource on a LiteLLM proxy, or query
  spend/token activity.
version: 1.0.0
audience: shared
license: MIT
compatibility: Requires curl (all operations), python3 (usage summaries).
metadata:
  author: BerriAI
  version: "1.0"
allowed-tools: Bash(curl:*) Bash(python3:*)
---

# LiteLLM Proxy Management

Administer a live LiteLLM proxy — models, keys, agents, MCP servers, orgs, teams, users, and usage.

## Setup

The admin key is in AWS Secrets Manager. Fetch it at the start of any session:

```bash
BASE="http://srv1724463.hstgr.cloud:42171"
KEY=$(aws secretsmanager get-secret-value --secret-id agentos/litellm/master_key --region us-east-1 --query SecretString --output text)
```

Then use $BASE and $KEY in all subsequent requests.


## API Reference

- Models: https://litellm.vercel.app/docs/proxy/model_management
- Keys: https://litellm.vercel.app/docs/proxy/virtual_keys
- Agents: https://docs.litellm.ai/docs/proxy/agents
- MCP: https://docs.litellm.ai/docs/mcp
- Orgs: https://litellm.vercel.app/docs/proxy/org_based_routing
- Teams: https://litellm.vercel.app/docs/proxy/team_based_routing
- Users: https://litellm.vercel.app/docs/proxy/virtual_keys#creating-a-user

---

## Models

### Add a model

1. **Public model name** — what callers send in `"model": "..."` (e.g. `gpt-4o`)
2. **Provider** — pick from the provider table below
3. **Credentials** — whatever that provider needs

| Provider | `litellm_params.model` | Extra params |
|---|---|---|
| OpenAI | `openai/gpt-4o` | `api_key` |
| Azure OpenAI | `azure/<deployment-name>` | `api_key`, `api_base`, `api_version` |
| Anthropic | `anthropic/claude-3-5-sonnet-20241022` | `api_key` |
| AWS Bedrock | `bedrock/anthropic.claude-3-5-sonnet-20241022-v2:0` | AWS creds via env |
| Google Vertex | `vertex_ai/gemini-1.5-pro` | `vertex_project`, `vertex_location` |
| Ollama | `ollama/llama3` | `api_base` (e.g. `http://localhost:11434`) |
| Groq | `groq/llama-3.3-70b-versatile` | `api_key` |
| Together AI | `together_ai/meta-llama/Llama-3-70b` | `api_key` |
| Mistral | `mistral/mistral-large-latest` | `api_key` |

Full list: https://docs.litellm.ai/docs/providers

```bash
curl -s -X POST "$BASE/model/new" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model_name": "<public-name>",
    "litellm_params": {
      "model": "<provider/deployment>",
      "api_key": "<key>",
      "api_base": "<base_if_needed>",
      "api_version": "<version_if_azure>"
    }
  }'
```

**Test after adding:**

```bash
# Basic routing test
curl -s -X POST "$BASE/chat/completions" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"model": "<public-name>", "messages": [{"role": "user", "content": "say hi"}], "max_tokens": 10}'

# Tool-use round-trip test (REQUIRED — load model-eval-tool-roundtrip skill)
```

⚠️ **No model ships to fleet agents without passing both the `say hi` test AND the tool-use round-trip test.** The echo bug (AGE-440) proved that basic completions don't catch tool-use regressions.

### Update a model

1. **model_id** (required) — look up if needed:

```bash
curl -s "$BASE/model/info" -H "Authorization: Bearer $KEY" -o /tmp/litellm_models.json
python3 -c "
import json
for m in json.load(open('/tmp/litellm_models.json')).get('data',[]):
  print(m['model_info']['id'], m['model_name'])
"
```

2. **What to change** — `api_key`, `api_base`, `api_version`, or `model` string.

```bash
curl -s -X POST "$BASE/model/update" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model_info": {"id": "<model_id>"},
    "litellm_params": {"api_key": "<new_key>", "api_base": "<new_base>"}
  }'
```

⚠️ **After updating, re-run the tool-use round-trip test.**

### Delete a model

1. **Model name or model_id** — look up ID first if you only have a name.
2. **Confirm** before deleting.

```bash
curl -s -X POST "$BASE/model/delete" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"id": "<model_id>"}'
```

Warn: any keys scoped to this model name will start getting errors.

---

## API Keys

### Generate a key

1. **Key alias** (recommended, e.g. `my-app-prod`)
2. **Scope** — `team_id` or `user_id`? (optional)
3. **Allowed models** (optional)
4. **Max budget** (optional)
5. **Expiry** (optional, e.g. `7d`, `30d`)

```bash
curl -s -X POST "$BASE/key/generate" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "key_alias": "<alias>",
    "team_id": "<team_id_or_omit>",
    "user_id": "<user_id_or_omit>",
    "models": [<models_or_empty>],
    "max_budget": <budget_or_null>,
    "duration": "<duration_or_omit>"
  }'
```

Show `key` to the user — it's only shown once.

### Update a key

1. **Key** (`sk-...`) — list if needed:

```bash
curl -s "$BASE/key/list?size=25&return_full_object=true" -H "Authorization: Bearer $KEY"
```

2. **What to change** — `max_budget`, `models`, `key_alias`, `tpm_limit`, `rpm_limit`, `duration`, `team_id`, `user_id`.

```bash
curl -s -X POST "$BASE/key/update" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"key": "<sk-...>", "max_budget": <value>, "models": [<models>]}'
```

### Delete keys

1. **Key(s)** (`sk-...`) or **key alias(es)** — list if needed.
2. **Confirm** before deleting.

```bash
# By key value
curl -s -X POST "$BASE/key/delete" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"keys": ["<sk-...>"]}'

# By alias
curl -s -X POST "$BASE/key/delete" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"key_aliases": ["<alias>"]}'
```

---

## Agents

### Create an agent

1. **Agent name** (required)
2. **Model** — which LiteLLM model (e.g. `gpt-4o`)
3. **Description** (optional)
4. **MCP servers** — list of `server_id`s (optional)

```bash
curl -s -X POST "$BASE/v1/agents" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "agent_name": "<name>",
    "litellm_params": {"model": "<model>"},
    "agent_card_params": {"name": "<name>", "description": "<description>", "version": "1.0"}
  }'
```

### List / Get agents

```bash
curl -s "$BASE/v1/agents" -H "Authorization: Bearer $KEY"
curl -s "$BASE/v1/agents/<agent_id>" -H "Authorization: Bearer $KEY"
```

### Update an agent

1. **agent_id** — list if needed.
2. **What to change** — `model`, `description`, `tpm_limit`, `rpm_limit`, MCP server access.

```bash
curl -s -X PATCH "$BASE/v1/agents/<agent_id>" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"litellm_params": {"model": "<new_model>"}}'
```

### Delete an agent

1. **agent_id** — list if needed.
2. **Confirm** before deleting.

```bash
curl -s -X DELETE "$BASE/v1/agents/<agent_id>" \
  -H "Authorization: Bearer $KEY"
```

Note: any keys/integrations pointing to this agent will stop working.

---

## MCP Servers

### Register an MCP server

1. **Server name** (required)
2. **URL** (required, e.g. `https://mcp.example.com/sse`)
3. **Transport** — `sse` (default), `http`, or `stdio`
4. **Description** (optional)
5. **Auth** — bearer token or API key (optional)

```bash
curl -s -X POST "$BASE/v1/mcp/server" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "server_name": "<name>",
    "url": "<url>",
    "transport": "sse",
    "description": "<description_or_omit>",
    "auth_type": "bearer_token",
    "credentials": "<token_if_needed>"
  }'
```

For unauthenticated servers, omit `auth_type` and `credentials`.

### List MCP servers

```bash
curl -s "$BASE/v1/mcp/server" -H "Authorization: Bearer $KEY"
```

### Update an MCP server

1. **server_id** — list if needed.
2. **What to change** — `url`, `credentials`, `description`, `allowed_tools`.

```bash
curl -s -X PUT "$BASE/v1/mcp/server" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"server_id": "<server_id>", "url": "<new_url>", "credentials": "<new_token>"}'
```

### Delete an MCP server

1. **server_id** — list if needed.
2. **Confirm** before deleting.

```bash
curl -s -X DELETE "$BASE/v1/mcp/server/<server_id>" \
  -H "Authorization: Bearer $KEY"
```

Note: any agents using this MCP server will lose access to its tools.

---

## Organizations

### Create an org

1. **Org name** (required, becomes `organization_alias`)
2. **Allowed models** (required)
3. **Max budget** (optional)
4. **TPM / RPM limits** (optional)

```bash
curl -s -X POST "$BASE/organization/new" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "organization_alias": "<name>",
    "models": [<models>],
    "max_budget": <budget_or_null>,
    "tpm_limit": <tpm_or_null>,
    "rpm_limit": <rpm_or_null>
  }'
```

### Delete orgs

1. **organization_id(s)** — list if needed: `curl -s "$BASE/organization/list" -H "Authorization: Bearer $KEY"`
2. **Confirm** before deleting.

```bash
curl -s -X DELETE "$BASE/organization/delete" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"organization_ids": ["<org_id>"]}'
```

---

## Teams

### Create a team

1. **Team name** (required, becomes `team_alias`)
2. **Max budget** (optional)
3. **Allowed models** (optional — leave empty to allow all)
4. **TPM / RPM limits** (optional)

```bash
curl -s -X POST "$BASE/team/new" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "team_alias": "<name>",
    "max_budget": <budget_or_null>,
    "models": [<models_or_empty>],
    "tpm_limit": <tpm_or_null>,
    "rpm_limit": <rpm_or_null>
  }'
```

### Update a team

1. **team_id** — list if needed: `curl -s "$BASE/team/list" -H "Authorization: Bearer $KEY"`
2. **What to change** — `team_alias`, `max_budget`, `models`, `tpm_limit`, `rpm_limit`, `blocked`.

```bash
curl -s -X POST "$BASE/team/update" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"team_id": "<team_id>", "max_budget": <value>, "models": [<models>]}'
```

### Delete teams

1. **team_id(s)** — list if needed.
2. **Confirm** before deleting.

```bash
curl -s -X POST "$BASE/team/delete" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"team_ids": ["<team_id>"]}'
```

Multiple teams: `"team_ids": ["id1", "id2"]`

---

## Users

### Create a user

1. **Email** (required)
2. **Role** — `proxy_admin`, `proxy_admin_viewer`, `internal_user` (default), `internal_user_viewer`
3. **Max budget** (optional)
4. **Allowed models** (optional)

```bash
curl -s -X POST "$BASE/user/new" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "user_email": "<email>",
    "user_role": "<role>",
    "max_budget": <budget_or_null>,
    "models": [<models_or_empty>]
  }'
```

Returns `user_id` and auto-generated API `key`.

### Update a user

1. **user_id** — list if needed: `curl -s "$BASE/user/list?page_size=25" -H "Authorization: Bearer $KEY"`
2. **What to change** — `max_budget`, `user_role`, `models`, `tpm_limit`, `rpm_limit`, `user_email`, `user_alias`.

```bash
curl -s -X POST "$BASE/user/update" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"user_id": "<user_id>", "max_budget": <value>, "user_role": "<role>", "models": [<models>]}'
```

### Delete users

1. **user_id(s)** — list if needed.
2. **Confirm** before deleting.

```bash
curl -s -X POST "$BASE/user/delete" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"user_ids": ["<user_id>"]}'
```

---

## Usage Reporting

Query daily activity and spend data.

1. **View by** — overall / user / team / org / tag (default: overall)
2. **Date range** — default to current month
3. **Filter by model?** (optional)

### Endpoints

| View | Endpoint |
|------|----------|
| Overall | `$BASE/user/daily/activity?start_date=...&end_date=...&page_size=30` |
| By team | `$BASE/team/daily/activity?team_ids=<id>&start_date=...&end_date=...` |
| By org | `$BASE/organization/daily/activity?organization_ids=<id>&start_date=...&end_date=...` |
| By user | `$BASE/user/daily/activity?user_id=<id>&start_date=...&end_date=...` |
| By tag | `$BASE/tag/daily/activity?start_date=...&end_date=...` |

### Response shape

```json
{
  "results": [
    {
      "date": "2026-03-14",
      "metrics": {
        "spend": 1.23,
        "prompt_tokens": 45000,
        "completion_tokens": 12000,
        "total_tokens": 57000,
        "api_requests": 120,
        "successful_requests": 118,
        "failed_requests": 2
      },
      "breakdown": {
        "models": { "gpt-4o": { "metrics": { "spend": 1.23 } } }
      }
    }
  ],
  "metadata": { "page": 1, "page_size": 10, "total_count": 31 }
}
```

Note: top-level key is `results` (not `data`).

### Summary table with python3

```bash
curl -s "$BASE/user/daily/activity?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD&page_size=30" \
  -H "Authorization: Bearer $KEY" | python3 -c "
import sys, json
d = json.load(sys.stdin)
rows = d.get('results', [])
print(f\"{'Date':<12} {'Requests':>10} {'Tokens':>12} {'Spend':>10}\")
print('-' * 46)
total_spend = 0
for r in rows:
    m = r.get('metrics', {})
    print(f'{r[\"date\"]:<12} {m.get(\"api_requests\",0):>10} {m.get(\"total_tokens\",0):>12} \${m.get(\"spend\",0):>9.4f}')
    total_spend += m.get('spend', 0)
print('-' * 46)
print(f\"{'TOTAL':<12} {'':>10} {'':>12} \${total_spend:>9.4f}\")
"
```

### Instructions

1. Ask for date range — default to current month.
2. Run the appropriate endpoint.
3. Print a table: Date | Requests | Tokens | Spend.
4. Show totals row at the bottom.
5. Highlight any days with `failed_requests > 0`.
6. If `metadata.total_pages > 1`, offer to fetch remaining pages.

---

## General Patterns

- All endpoints use `Authorization: Bearer $KEY` header.
- Most list endpoints support `page_size` and pagination.
- Always confirm before deleting any resource.
- After model changes (add/update), always run both the basic routing test and the tool-use round-trip test.