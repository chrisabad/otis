---
name: paperclip-key-provisioning
description: Provision, rotate, and manage PaperClip API keys for agents and companies
required_tools:
  - terminal
  - read
version: 1.0.0
audience: shared
---
# PaperClip API Key Provisioning

## When to use
- A new agent needs a key for a PaperClip company
- An existing agent key is broken, revoked, or wrong
- A memory file references a phantom agent UUID that doesn't exist
- `403 Forbidden` or auth failures on PaperClip API calls

## How PaperClip key provisioning works
Keys are stored in the embedded Postgres database. There is no HTTP endpoint to create keys — they must be inserted directly via Postgres.

**Socket:** `/tmp/.s.PGSQL.54329`  
**Database:** `paperclip`  
**User:** `paperclip`  
**Password:** `paperclip`  

Connect via node (pg module is available):
```js
const { Client } = require('pg');
const client = new Client({ host: '/tmp', port: 54329, database: 'paperclip', user: 'paperclip', password: 'paperclip' });
```

## Key schema
Table: `agent_api_keys`
| Column | Notes |
|--------|-------|
| `id` | UUID — use `gen_random_uuid()` or `crypto.randomUUID()` |
| `agent_id` | Agent UUID from `agents` table |
| `company_id` | Company UUID |
| `name` | Human label (e.g. `juno-wee-main`) |
| `key_hash` | SHA-256 hash of the raw `pcp_` key |
| `revoked_at` | NULL = active |
| `created_at` | NOW() |

Key format: `pcp_` + 48 hex chars (24 random bytes)

## Provisioning script
```js
const { Client } = require('pg');
const crypto = require('crypto');

function genKey() {
  return 'pcp_' + crypto.randomBytes(24).toString('hex');
}
function hashKey(key) {
  return crypto.createHash('sha256').update(key).digest('hex');
}

const client = new Client({ host: '/tmp', port: 54329, database: 'paperclip', user: 'paperclip', password: 'paperclip' });

client.connect().then(async () => {
  const AGENT_ID = '<agent-uuid>';
  const COMPANY_ID = '<company-uuid>';
  const KEY_NAME = '<label>';

  // 1. Ensure agent is a member of the company
  const existing = await client.query(
    'SELECT id FROM company_memberships WHERE company_id=$1 AND principal_id=$2 AND principal_type=$3',
    [COMPANY_ID, AGENT_ID, 'agent']
  );
  if (existing.rows.length === 0) {
    await client.query(
      'INSERT INTO company_memberships (id, company_id, principal_type, principal_id, status, membership_role, created_at, updated_at) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW(), NOW())',
      [COMPANY_ID, 'agent', AGENT_ID, 'active', 'member']
    );
  }

  // 2. Generate and insert key
  const rawKey = genKey();
  const keyHash = hashKey(rawKey);
  await client.query(
    'INSERT INTO agent_api_keys (id, agent_id, company_id, name, key_hash, created_at) VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW())',
    [AGENT_ID, COMPANY_ID, KEY_NAME, keyHash]
  );

  console.log('New key:', rawKey);
  client.end();
});
```

## Verification
After generating, verify the key works:
```bash
curl -s -o /dev/null -w "%{http_code}" \
  "http://127.0.0.1:3101/api/companies/<COMPANY_ID>/issues?limit=1" \
  -H "Authorization: Bearer <NEW_KEY>"
# Should return 200
```

## Important: Juno's agent architecture
**There is ONE Juno agent in PaperClip:** `cdebff99-6651-42e6-8a81-b6b493202a3e`

Juno is a member of ALL 7 companies, each with its own key. See `memory/paperclip-setup.md` for the current key map.

Do NOT invent per-company Juno agent UUIDs. There is only one.

## Revoking a key
```sql
UPDATE agent_api_keys SET revoked_at = NOW() WHERE key_hash = '<hash>';
```

## Looking up all keys for an agent
```js
await client.query(
  'SELECT k.company_id, c.name as company, k.name, k.revoked_at FROM agent_api_keys k JOIN companies c ON k.company_id = c.id WHERE k.agent_id = $1',
  [AGENT_ID]
);
```
