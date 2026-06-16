---
name: lemon-squeezy
description: Query Font Replacer revenue data from Lemon Squeezy API — subscriptions, MRR, cancellations, refunds, and order history. Use when monitoring SaaS billing health, pulling current MRR, checking for cancellations or refund spikes, or generating revenue summaries for Font Replacer. Requires LEMONSQUEEZY_API_KEY from agent .env.
version: 1.0.0
audience: shared
agents: [otis, cass]
---
# Lemon Squeezy

Font Replacer billing and revenue monitoring via the Lemon Squeezy REST API.

## Auth

```bash
source /home/hermes/.hermes/workspace/agents/cass/.env
# LEMONSQUEEZY_API_KEY must be set
```

## Core Endpoints

### Active subscriptions (current MRR basis)
```bash
curl -s --max-time 15 \
  -H "Authorization: Bearer $LEMONSQUEEZY_API_KEY" \
  "https://api.lemonsqueezy.com/v1/subscriptions?page[size]=50"
```
Key fields: `data[].attributes.status` (active/cancelled/expired), `data[].attributes.first_subscription_item.price` (cents/month), `data[].attributes.customer_id`

### Recent orders (new sales + refunds)
```bash
curl -s --max-time 15 \
  -H "Authorization: Bearer $LEMONSQUEEZY_API_KEY" \
  "https://api.lemonsqueezy.com/v1/orders?page[size]=25&sort=-created_at"
```
Key fields: `data[].attributes.status` (paid/refunded/pending), `data[].attributes.total` (cents), `data[].attributes.refunded`

### Specific subscription detail
```bash
curl -s --max-time 10 \
  -H "Authorization: Bearer $LEMONSQUEEZY_API_KEY" \
  "https://api.lemonsqueezy.com/v1/subscriptions/{id}"
```

### Search by customer email (for subscriptions)
```bash
curl -s --max-time 10 \
  -H "Authorization: Bearer $LEMONSQUEEZY_API_KEY" \
  "https://api.lemonsqueezy.com/v1/subscriptions?filter[user_email]=customer@example.com"
```

### Search orders by customer email
```bash
curl -s --max-time 10 \
  -H "Authorization: Bearer $LEMONSQUEEZY_API_KEY" \
  "https://api.lemonsqueezy.com/v1/orders?filter[user_email]=customer@example.com"
```

## MRR Calculation

```python
# MRR = sum of active subscription prices / 100
active = [s for s in subs if s['attributes']['status'] == 'active']
mrr = sum(s['attributes']['first_subscription_item']['price'] for s in active) / 100
```

## Thresholds (Font Replacer)

| Signal | Normal | Alert |
|--------|--------|-------|
| Cancellations in 7d | 0–2 | 3+ |
| Refunds in 7d | 0–1 | 2+ or >$50 |
| MRR delta week-over-week | ±10% | >−15% |

## Alert Routing

- Routine report → FON-1 PaperClip comment + `#font-replacer` (C0AKKLVA3S8)
- Refund >$50 or cancellation spike → also DM D0AFURXGVTM
- API auth failure → log, alert Chris via DM, do NOT fabricate data

## Pagination

If `meta.page.lastPage > 1`, loop:
```bash
"https://api.lemonsqueezy.com/v1/subscriptions?page[size]=50&page[number]=2"
```

## Pitfalls

- **Invoice numbers ≠ Order IDs.** The invoice number in Lemon Squeezy receipt emails (e.g., "Invoice #2408530") is NOT the same as the order ID. `GET /v1/orders/2408530` will 404. Use email filter to find the customer's orders instead.
- **`filter[invoice_number]` is not a valid filter.** Attempting `filter[invoice_number]=XXXX` returns a 400 "Filter parameter invoice_number is not allowed." error.
- **Subscription status vs cancelled field.** A subscription can have `status: "expired"` AND `cancelled: true` — both mean it's over. When handling a cancellation request, check both fields before taking action; the subscription may already be closed.