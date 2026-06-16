---
name: monarch
description: Access Monarch Money via local Python session (no MCP). Use when you need Monarch transaction/account lookups, mortgage payment checks, merchant searches, monthly spending summaries, or fast availability diagnostics. Also handles transaction recategorization, rule creation/deletion, and review status updates.
version: 1.0.0
audience: shared
agents: [otis, cass]
---
# Monarch

Use local scripts in `/home/hermes/.hermes/workspace/tools`.

## Workflow

1. Test session directly with aiohttp (the preflight script no longer exists at the workspace path):

```python
import pickle, aiohttp, asyncio, json
with open('/home/hermes/.mm/mm_session.pickle', 'rb') as f:
    session = pickle.load(f)
TOKEN = session['token']
headers = {
    "Authorization": f"Token {TOKEN}",
    "Content-Type": "application/json",
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    "Origin": "https://app.monarchmoney.com",
    "Referer": "https://app.monarchmoney.com/",
    "Accept": "*/*",
}
# Test: query '{ accounts { id name } }'
```

2. If 401 or errors, refresh session with `python3 /home/hermes/.hermes/workspace/tools/monarch-login.py`

3. **CRITICAL**: Direct GraphQL queries require the full browser headers above. Without `Origin` and `Referer`, Monarch returns generic errors for most queries (even though `accounts` may work without them).

## Common command: mortgage amount/history

```bash
python3 /home/hermes/.hermes/workspace/tools/monarch-mortgage.py --search Guild --months 12
```

Notes:
- Default keyword guard is `mortgage` to avoid false positives like non-mortgage "Guild" merchants.
- Output is JSON; report `current_monthly` plus recent payment dates/amounts.

## Direct ad-hoc queries (aiohttp — PREFERRED)

The `monarchmoney` Python library's `get_transactions` is broken (TypeError on `Client.execute_async()`). Use direct aiohttp queries instead.

```python
import pickle, aiohttp, asyncio, json

with open('/home/hermes/.mm/mm_session.pickle', 'rb') as f:
    session = pickle.load(f)
TOKEN = session['token']
API = "https://api.monarch.com/graphql"
headers = {
    "Authorization": f"Token {TOKEN}",
    "Content-Type": "application/json",
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    "Origin": "https://app.monarchmoney.com",
    "Referer": "https://app.monarchmoney.com/",
    "Accept": "*/*",
}

async def gql(query, variables=None, operation=None):
    payload = {"query": query}
    if variables: payload["variables"] = variables
    if operation: payload["operationName"] = operation
    async with aiohttp.ClientSession() as s:
        async with s.post(API, json=payload, headers=headers) as r:
            return await r.json()
```

- `allTransactions(filters: TransactionFilterInput)` — NOT `transactions(filters: ...)`. The field name `transactions` without the `all` prefix causes errors.
- **CRITICAL**: The `orderBy` parameter in `results()` causes `Something went wrong while processing: None` errors. Omit `orderBy` entirely — results default to date-descending order.

Key queries:
- `allTransactions(filters: {startDate: "...", endDate: "...", search: ""}) { totalCount results(offset: 0, limit: 200, orderBy: "date") { id amount date needsReview reviewStatus isRecurring notes category { id name } merchant { name id } account { id displayName } } }`
- `recurringTransactionItems(startDate: "...", endDate: "...") { stream { id frequency amount merchant { name } } date amount category { name } account { displayName } }`
- `accounts { id name balance }`
- `transactionCategories { id name }`

## GraphQL API (direct — use for rules and anything the library doesn't cover)

The raw GraphQL API exposes significantly more than the Python library. Use it directly for rule management and other gaps.

**Auth:**
```python
import pickle
with open('/home/hermes/.mm/mm_session.pickle', 'rb') as f:
    session = pickle.load(f)
TOKEN = session['token']
```

**Base request pattern:**
```python
import aiohttp, asyncio, json

API = "https://api.monarch.com/graphql"
HDR = {
    "Authorization": f"Token {TOKEN}",
    "Content-Type": "application/json",
    "User-Agent": "Mozilla/5.0",
    "Origin": "https://app.monarchmoney.com",
}

async def gql(query, variables=None, operation=None):
    payload = {"query": query}
    if variables: payload["variables"] = variables
    if operation: payload["operationName"] = operation
    async with aiohttp.ClientSession() as s:
        async with s.post(API, json=payload, headers=HDR) as r:
            return await r.json()
```

### Transaction rules — reading

```graphql
query {
  transactionRules {
    id
    order
    categoryIds        # list of category IDs this rule assigns
    accountIds         # list of account IDs this rule matches
    reviewStatusAction # "reviewed" | null
    merchantCriteria { operator value }   # operator: "contains" | "eq" | etc.
    amountCriteria { operator value }     # operator: "gt" | "lt" | "eq" | etc.
  }
}
```

**Confirmed working fields:** `id`, `order`, `categoryIds`, `accountIds`, `amountCriteria`, `merchantCriteria`, `reviewStatusAction`

**Fields that do NOT exist on rules:** `merchantName`, `reviewStatus`, `applyToExisting`, `sendNotification`, `labels`, `category`, `merchant`, `tagIds`, `name`, `description`, `enabled`, `active`

### Transaction rules — creating (V2)

```python
# Create a rule: merchant contains "Weekend" → Salary & Wages, auto-reviewed
result = await gql('''mutation {
  createTransactionRuleV2(input: {
    merchantCriteria: [{ operator: "contains", value: "weekend" }]
    categoryIds: ["212422101593280401"]
    reviewStatusAction: "reviewed"
  }) {
    transactionRule { id categoryIds merchantCriteria { operator value } reviewStatusAction }
    errors { message }
  }
}''')
```

Input fields accepted by `createTransactionRuleV2`:
- `merchantCriteria`: array of `{ operator, value }` — operator is `"contains"` or `"eq"`
- `categoryIds`: array of category ID strings
- `accountIds`: array of account ID strings
- `amountCriteria`: `{ operator, value }` — operator is `"gt"`, `"lt"`, `"eq"`
- `reviewStatusAction`: `"reviewed"` | `null`
- At least one criteria field is required (error: "Transaction rule must have one criteria")

### Transaction rules — deleting

Use the **V1 mutation with inline ID** (not a GraphQL variable):

```python
result = await gql(f'mutation {{ deleteTransactionRule(id: "{rule_id}") {{ deleted errors {{ message }} }} }}')
# Note: returns deleted: false even on success — verify by re-querying the rules list
```

**Gotcha:** `deleteTransactionRule` returns `deleted: false` even when the deletion succeeds. Always verify by re-fetching `transactionRules` and confirming the ID is gone.
- `deleteTransactionRuleV2(id: "...")` does NOT work (schema error)
- `deleteTransactionRule` with GraphQL variables also returns "Not found" — use inline string only
- `updateTransactionRuleV2` returns "Not found" for rules created before V2 (legacy rules)

### Useful account IDs (Chris's accounts)

| Account | ID |
|---|---|
| Fixed Spending (...6204) | `210465888311758300` |
| Sapphire (...3734) | `228117955438234643` |
| United (...4583) | `228117955709815828` |
| Chris (...3274) | `210465888363138525` |
| Variable Spending (...3137) | `215138102247214539` |
| Leesamarie Spending (...7815) | `210465888562367968` |

### Useful category IDs (frequently used)

| Category | ID |
|---|---|
| Salary & Wages | `212422101593280401` |
| Dining & Coffee | `212422177785957476` |
| Groceries | `212422174063512675` |
| General Shopping | `212422197776010407` |
| Subscriptions | `226283123445911108` |
| Medical & Dental | `212422182103993505` |
| Fees & Charges | `212422250697641446` |
| Travel & Vacation | `212422210256162022` |
| Fuel / EV Charging | `212422158072728607` |
| Transit & Ride-Share | `212422170082069541` |
| Transfers & Internal | `212422114883981264` |
| Mortgage / Rent | `212422118578114513` |

## Reliability rules

- Do not claim Monarch is unavailable until preflight fails.
- Do not mention MCP for Monarch in this environment.
- For user-facing answers, include the exact amount, latest charge date, and any detected change points over time.
- For rule changes, always verify by re-querying after the mutation — Monarch API returns misleading success/failure signals.
- The Python library session expires periodically. If you get 401, run `python3 tools/monarch-login.py`.
