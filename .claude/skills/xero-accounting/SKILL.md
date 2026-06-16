---
name: xero-accounting
description: 'Xero accounting for Chris''s 3 businesses (Kaleidoscope, Font Replacer, Diacritic Mining). Query transactions, P&L, and Balance Sheets; reconcile/categorize transactions; flag large items (≥$100) for review; run monthly close. Triggers: "xero", "accounting", "P&L", "reconcile", "uncategorized", "balance sheet", "business finances", "close the books".'
version: 1.0.0
audience: shared
agents: [otis, cass]
---
# Xero Accounting

## Orgs

| Name | Env Prefix | Plan |
|------|-----------|------|
| Kaleidoscope | `XERO_KALEIDOSCOPE_*` | Growing |
| Font Replacer | `XERO_FONT_REPLACER_*` | Early |
| Diacritic Mining | `XERO_DIACRITIC_MINING_*` | Early |

Credentials live in `.env`. Tokens expire ~30 min — re-fetch before each session.

---

## Step 1 — Token Refresh

Always refresh tokens before making API calls:

```bash
cd /home/hermes/.hermes/workspace
python3 tools/xero-token.py              # all 3 orgs
python3 tools/xero-token.py --org kaleidoscope  # single org
```

This writes `XERO_<ORG>_ACCESS_TOKEN` and `XERO_<ORG>_TENANT_ID` back into `.env`.

If a 401 occurs mid-session, re-run the token script and retry.

---

## Step 2 — Auth Pattern

Load fresh tokens from `.env` before each request block:

```python
import base64, os, requests
from pathlib import Path
from dotenv import dotenv_values

env = dotenv_values("/home/hermes/.hermes/workspace/.env")

def xero_headers(org: str) -> dict:
    """Return headers with a fresh token for the given org (e.g. 'kaleidoscope')."""
    prefix = f"XERO_{org.upper()}"
    token = env.get(f"{prefix}_ACCESS_TOKEN")
    tenant_id = env.get(f"{prefix}_TENANT_ID")
    return {
        "Authorization": f"Bearer {token}",
        "Xero-Tenant-Id": tenant_id,
        "Accept": "application/json",
    }

BASE = "https://api.xero.com/api.xro/2.0"
```

---

## Workflows

### Query Transactions by Org + Date Range

```python
# Bank transactions for a date range
resp = requests.get(f"{BASE}/BankTransactions",
    headers=xero_headers("kaleidoscope"),
    params={
        "where": 'Date>=DateTime(2026,01,01)&&Date<=DateTime(2026,03,31)',
        "order": "Date DESC",
    }
)
txns = resp.json().get("BankTransactions", [])
```

For invoices instead: use `/Invoices` with the same date filter.

See `references/api-endpoints.md` for full parameter reference.

### Query Uncategorized / Unreconciled Transactions

```python
# Unreconciled bank transactions
resp = requests.get(f"{BASE}/BankTransactions",
    headers=xero_headers("kaleidoscope"),
    params={"where": "IsReconciled==false&&Status==\"AUTHORISED\""}
)

# Transactions with no account assigned (BankAccount type = BANK, no LineItem Account)
# Look for empty or "Uncategorized" account codes in the response
```

Tip: BankTransactions with `BankAccount.Type == "BANK"` and no reconciled `Account` on their line items are the uncategorized set.

### Bulk Reconcile Already-Categorized Transactions (API)

Transactions imported from Wave or other sources arrive categorized but unreconciled. You can mark them reconciled via API in batches:

```python
import time

# Fetch all unreconciled
all_txns = []
page = 1
while True:
    r = requests.get(f"{BASE}/BankTransactions?where=IsReconciled==false&pageSize=100&page={page}",
        headers=xero_headers("kaleidoscope"))
    txns = r.json().get("BankTransactions", [])
    all_txns.extend(txns)
    if len(txns) < 100: break
    page += 1

# Verify all have account codes before reconciling
safe = [t for t in all_txns if all(li.get("AccountCode") or li.get("AccountID") for li in t.get("LineItems", []))]

# Reconcile in batches of 50
BATCH = 50
headers_post = {**xero_headers("kaleidoscope"), "Content-Type": "application/json"}
for i in range(0, len(safe), BATCH):
    batch = safe[i:i+BATCH]
    payload = {"BankTransactions": [{"BankTransactionID": t["BankTransactionID"], "IsReconciled": True} for t in batch]}
    r = requests.post(f"{BASE}/BankTransactions", headers=headers_post, json=payload)
    print(f"Batch {i//BATCH+1}: {r.status_code} — {r.json().get('Status')}")
    time.sleep(0.5)
```

**⚠️ API Reconciliation Limitations (confirmed 2026-03-21):**

| Transaction Type | API Reconcilable? | Notes |
|---|---|---|
| SPEND / RECEIVE (normal) | ✅ Yes | Set `IsReconciled: True` in POST |
| SPEND-TRANSFER / RECEIVE-TRANSFER | ❌ No | Xero throws server error — matched pairs must be reconciled in UI |
| Bank feed statement lines (live feed) | ❌ No | These appear in the Xero reconciliation UI queue but are not BankTransactions yet — UI-only workflow |

**The 435-item credit card queue in the Xero UI** is bank feed statement lines, not BankTransactions — the API cannot touch them. They must be matched/created in the Xero reconciliation UI. Options:
1. Do manually in Xero UI (~45–60 min for 435 items)
2. Browser automation on Lauryn (slower but possible)
3. Leave for accountant if full reconciliation isn't required

### Query P&L Report

```python
resp = requests.get(f"{BASE}/Reports/ProfitAndLoss",
    headers=xero_headers("kaleidoscope"),
    params={
        "fromDate": "2026-01-01",
        "toDate": "2026-03-31",
        "standardLayout": "true",
    }
)
report = resp.json()["Reports"][0]
```

### Query Balance Sheet

```python
resp = requests.get(f"{BASE}/Reports/BalanceSheet",
    headers=xero_headers("kaleidoscope"),
    params={"date": "2026-03-31", "standardLayout": "true"}
)
```

### Categorize / Update a Transaction

```python
# Update account code on a bank transaction
txn_id = "abc-123"
payload = {
    "BankTransactions": [{
        "BankTransactionID": txn_id,
        "LineItems": [{
            "AccountCode": "200",   # use correct account code from Chart of Accounts
            "Description": "Updated description",
        }]
    }]
}
resp = requests.post(f"{BASE}/BankTransactions",
    headers={**xero_headers("kaleidoscope"), "Content-Type": "application/json"},
    json=payload,
)
```

Fetch account codes with `GET /Accounts` if unsure. See `references/account-codes.md`.

---

## Flag Transactions ≥ $100 for Chris's Review

After fetching transactions for any org:

```python
REVIEW_THRESHOLD = 100.00

flagged = [
    t for t in txns
    if float(t.get("Total", 0)) >= REVIEW_THRESHOLD
    and not t.get("IsReconciled", False)
]

# Format for Slack output
for t in flagged:
    print(f"⚠️  {t['Date'][:10]}  ${t['Total']:.2f}  {t.get('Reference','—')}  [{t['BankTransactionID'][:8]}]")
```

Route flagged output → `#money` channel (`C0AKKLV97PE`, accountId=kaleidoscope).

---

## Monthly Close Checklist

Run this across all 3 orgs at month end. Post summary to `#money`.

### Checklist Steps

1. **Refresh tokens** — `python3 tools/xero-token.py`
2. **Unreconciled check** — Query unreconciled BankTransactions for each org
3. **Uncategorized check** — Flag any transactions missing an Account code
4. **P&L pull** — Get ProfitAndLoss for the closed month, all 3 orgs
5. **Anomaly flags** — See criteria below
6. **Summarize net P&L** per business and post to `#money`

### Anomaly Detection Criteria

| Signal | Action |
|--------|--------|
| Diacritic Mining revenue < $100/mo | Flag — possible mining outage |
| Any org has >5 unreconciled BankTransactions (not bank feed lines) | Flag for review |
| Single transaction ≥ $100 unreconciled | Flag individually |
| Diacritic Mining "Uncategorized Income" (CHK 8991 transfers) | Flag — needs manual reclassification |
| Net loss > $200 in Diacritic Mining | Flag — hosting cost vs. revenue check |

### Sample Summary Output (post to `#money`)

```
📊 Monthly Close — [Month Year]

*Kaleidoscope*
Revenue: $X,XXX | Expenses: $XXX | Net: $X,XXX
Unreconciled: 0 ✅

*Font Replacer*
Revenue: $XX | Expenses: $XX | Net: $XX
Unreconciled: 2 ⚠️ (needs review)

*Diacritic Mining*
Revenue: $107 | Expenses: $186 | Net: -$79 ⚠️
Unreconciled: 1

Flagged for Chris: [list transactions ≥$100 or anomalies]
```

---

## Error Patterns

| Error | Cause | Fix |
|-------|-------|-----|
| `401 Unauthorized` | Token expired | Re-run `tools/xero-token.py` |
| `403 Forbidden` | Scope not enabled | Check Custom Connection scopes in Xero portal |
| `404` on report endpoint | Plan restriction | Early plan may not support all reports |
| `429 Too Many Requests` | Rate limit (60 calls/min) | Add `time.sleep(1)` between calls |
| Empty `BankTransactions` | No transactions in date range | Verify date format `DateTime(YYYY,MM,DD)` |

---

## References

- `references/api-endpoints.md` — Full endpoint catalog, query params, filter syntax, pagination, rate limits
- `references/account-codes.md` — Common account codes for all 3 orgs + categorization guide
- `references/monthly-close.md` — Detailed monthly close checklist, per-org anomaly thresholds, Slack report format
