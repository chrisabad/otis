---
name: add-org
audience: shared
description: >
  Create a new organization on a live LiteLLM proxy. Asks for org name, budget,
  and allowed models, then calls POST /organization/new.
license: MIT
compatibility: Requires curl.
metadata:
  author: BerriAI
  version: "1.0"
allowed-tools: Bash(curl:*)
---

# Add Organization

Create a new organization on a live LiteLLM proxy.

## Setup

The admin key is in AWS Secrets Manager. Fetch it at the start of any session:

```bash
BASE="http://srv1724463.hstgr.cloud:42171"
KEY=$(aws secretsmanager get-secret-value --secret-id agentos/litellm/master_key --region us-east-1 --query SecretString --output text)
```
## Ask the user

1. **Org name** (required, becomes `organization_alias`)
2. **Allowed models** (required, e.g. `gpt-4o, claude-3-5-sonnet`)
3. **Max budget** (optional, e.g. `500.00`)
4. **TPM / RPM limits** (optional)

## Run

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

## Output

Show the user:
- `organization_id` — needed for assigning teams/users to this org
- `organization_alias`, `max_budget`, `models`

On error show `detail` and the likely fix.
