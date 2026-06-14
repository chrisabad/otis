#!/bin/bash
# LemonSqueezy API CLI - Interact with the LemonSqueezy billing platform
# Requires: LEMONSQUEEZY_API_KEY environment variable, curl, jq

set -euo pipefail

BASE_URL="https://api.lemonsqueezy.com/v1"

check_deps() {
    command -v curl >/dev/null 2>&1 || { echo "Error: curl is required" >&2; exit 1; }
    command -v jq >/dev/null 2>&1 || { echo "Error: jq is required" >&2; exit 1; }
    [ -n "${LEMONSQUEEZY_API_KEY:-}" ] || { echo "Error: LEMONSQUEEZY_API_KEY environment variable is required" >&2; exit 1; }
}

api_get() {
    local path="$1"
    curl -s "${BASE_URL}${path}" \
        -H "Authorization: Bearer $LEMONSQUEEZY_API_KEY" \
        -H "Accept: application/vnd.api+json"
}

api_patch() {
    local path="$1"
    local body="$2"
    curl -s -X PATCH "${BASE_URL}${path}" \
        -H "Authorization: Bearer $LEMONSQUEEZY_API_KEY" \
        -H "Accept: application/vnd.api+json" \
        -H "Content-Type: application/vnd.api+json" \
        -d "$body"
}

api_post() {
    local path="$1"
    local body="$2"
    curl -s -X POST "${BASE_URL}${path}" \
        -H "Authorization: Bearer $LEMONSQUEEZY_API_KEY" \
        -H "Accept: application/vnd.api+json" \
        -H "Content-Type: application/vnd.api+json" \
        -d "$body"
}

# ============================================================================
# CUSTOMER
# ============================================================================

customer_lookup() {
    local email="${1:-}"
    [ -n "$email" ] || { echo "Error: email is required" >&2; echo "Usage: lemonsqueezy-api.sh customer lookup <email>" >&2; exit 1; }
    local encoded
    encoded=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$email'))")
    local result
    result=$(api_get "/customers?filter%5Bemail%5D=${encoded}")
    local count
    count=$(echo "$result" | jq '.data | length')
    if [ "$count" -eq 0 ]; then
        echo '{"found": false, "email": "'"$email"'"}'
        return
    fi
    echo "$result" | jq '.data[0] | {
        found: true,
        id: .id,
        name: .attributes.name,
        email: .attributes.email,
        status: .attributes.status,
        total_revenue: .attributes.total_revenue_currency_formatted,
        customer_portal_url: .attributes.urls.customer_portal
    }'
}

# ============================================================================
# LICENSE KEY
# ============================================================================

license_lookup() {
    local email="${1:-}"
    [ -n "$email" ] || { echo "Error: email is required" >&2; echo "Usage: lemonsqueezy-api.sh license lookup <email>" >&2; exit 1; }

    local encoded
    encoded=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$email'))")

    # Step 1: find orders for this email
    local orders
    orders=$(api_get "/orders?filter%5Buser_email%5D=${encoded}")
    local order_count
    order_count=$(echo "$orders" | jq '.data | length')

    if [ "$order_count" -eq 0 ]; then
        echo '{"found": false, "email": "'"$email"'", "reason": "no orders found"}'
        return
    fi

    # Step 2: for each order, look up license keys and collect results
    local all_keys='[]'
    local i=0
    while [ $i -lt "$order_count" ]; do
        local order_id
        order_id=$(echo "$orders" | jq -r ".data[$i].id")
        local keys
        keys=$(api_get "/license-keys?filter%5Border_id%5D=${order_id}")
        all_keys=$(echo "$all_keys $keys" | jq -s '.[0] + [.[1].data[] | {
            id: .id,
            key: .attributes.key,
            status: .attributes.status,
            disabled: .attributes.disabled,
            instances_count: .attributes.instances_count,
            activation_limit: .attributes.activation_limit,
            order_id: (.attributes.order_id | tostring),
            product_id: (.attributes.product_id | tostring),
            created_at: .attributes.created_at
        }]')
        i=$((i + 1))
    done

    local key_count
    key_count=$(echo "$all_keys" | jq 'length')
    echo "{\"found\": true, \"email\": \"$email\", \"key_count\": $key_count, \"keys\": $all_keys}"
}

# ============================================================================
# ORDER
# ============================================================================

order_lookup() {
    local email="${1:-}"
    [ -n "$email" ] || { echo "Error: email is required" >&2; echo "Usage: lemonsqueezy-api.sh order lookup <email>" >&2; exit 1; }

    local encoded
    encoded=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$email'))")
    local result
    result=$(api_get "/orders?filter%5Buser_email%5D=${encoded}")
    local count
    count=$(echo "$result" | jq '.data | length')

    if [ "$count" -eq 0 ]; then
        echo '{"found": false, "email": "'"$email"'"}'
        return
    fi

    echo "$result" | jq '{
        found: true,
        count: (.data | length),
        orders: [.data[] | {
            id: .id,
            order_number: .attributes.order_number,
            status: .attributes.status,
            total: .attributes.total,
            total_formatted: .attributes.total_formatted,
            refunded: .attributes.refunded,
            refunded_amount: .attributes.refunded_amount,
            refunded_amount_formatted: .attributes.refunded_amount_formatted,
            currency: .attributes.currency,
            created_at: .attributes.created_at
        }]
    }'
}

order_refund() {
    local order_id="${1:-}"
    [ -n "$order_id" ] || { echo "Error: order_id is required" >&2; echo "Usage: lemonsqueezy-api.sh order refund <order_id> [--amount <cents>|--full]" >&2; exit 1; }
    shift

    local amount=""
    local full=false
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --amount) amount="$2"; shift 2 ;;
            --full)   full=true; shift ;;
            *) shift ;;
        esac
    done

    if [ "$full" = true ]; then
        local order
        order=$(api_get "/orders/${order_id}")
        if echo "$order" | jq -e '.errors' >/dev/null 2>&1; then
            echo "$order" | jq '{success: false, errors: [.errors[].detail]}'
            return
        fi
        amount=$(echo "$order" | jq -r '.data.attributes.total')
    fi

    [ -n "$amount" ] || { echo "Error: specify --amount <cents> or --full" >&2; exit 1; }

    local body
    body=$(jq -n --arg id "$order_id" --argjson amount "$amount" \
        '{"data": {"type": "orders", "id": $id, "attributes": {"amount": $amount}}}')
    local result
    result=$(api_post "/orders/${order_id}/refund" "$body")

    if echo "$result" | jq -e '.errors' >/dev/null 2>&1; then
        echo "$result" | jq '{success: false, errors: [.errors[].detail]}'
    else
        echo "$result" | jq '{
            success: true,
            id: .data.id,
            order_number: .data.attributes.order_number,
            refunded: .data.attributes.refunded,
            refunded_amount: .data.attributes.refunded_amount_formatted,
            status: .data.attributes.status
        }'
    fi
}

# ============================================================================
# SUBSCRIPTION
# ============================================================================

subscription_lookup() {
    local email="${1:-}"
    [ -n "$email" ] || { echo "Error: email is required" >&2; echo "Usage: lemonsqueezy-api.sh subscription lookup <email>" >&2; exit 1; }

    local encoded
    encoded=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$email'))")
    local result
    result=$(api_get "/subscriptions?filter%5Buser_email%5D=${encoded}")
    local count
    count=$(echo "$result" | jq '.data | length')

    if [ "$count" -eq 0 ]; then
        echo '{"found": false, "email": "'"$email"'"}'
        return
    fi

    echo "$result" | jq '{
        found: true,
        count: (.data | length),
        subscriptions: [.data[] | {
            id: .id,
            status: .attributes.status,
            product_name: .attributes.product_name,
            variant_name: .attributes.variant_name,
            user_email: .attributes.user_email,
            user_name: .attributes.user_name,
            renews_at: .attributes.renews_at,
            ends_at: .attributes.ends_at,
            cancelled: .attributes.cancelled,
            urls: .attributes.urls
        }]
    }'
}

subscription_cancel() {
    local id="${1:-}"
    [ -n "$id" ] || { echo "Error: subscription id is required" >&2; echo "Usage: lemonsqueezy-api.sh subscription cancel <id>" >&2; exit 1; }

    local body
    body=$(jq -n --arg id "$id" '{"data": {"type": "subscriptions", "id": $id, "attributes": {"cancelled": true}}}')
    local result
    result=$(api_patch "/subscriptions/${id}" "$body")

    # Check for errors
    if echo "$result" | jq -e '.errors' >/dev/null 2>&1; then
        echo "$result" | jq '{success: false, errors: [.errors[].detail]}'
    else
        echo "$result" | jq '{
            success: true,
            id: .data.id,
            status: .data.attributes.status,
            cancelled: .data.attributes.cancelled,
            ends_at: .data.attributes.ends_at
        }'
    fi
}

# ============================================================================
# DISPATCH
# ============================================================================

usage() {
    cat >&2 << 'USAGE'
LemonSqueezy API CLI

Commands:
  customer lookup <email>              Look up a customer by email (includes billing portal URL)
  license lookup <email>               Look up license key(s) for an email address
  order lookup <email>                 Look up orders for an email (includes total, refund status)
  order refund <order_id> --full       Issue a full refund for an order
  order refund <order_id> --amount N   Issue a partial refund (N = cents, e.g. 1000 = $10.00)
  subscription lookup <email>          Look up subscriptions for an email address
  subscription cancel <id>             Cancel a subscription by ID

Environment:
  LEMONSQUEEZY_API_KEY           Required
USAGE
    exit 1
}

check_deps

resource="${1:-}"
action="${2:-}"
shift 2 2>/dev/null || true

case "$resource" in
    customer)
        case "$action" in
            lookup) customer_lookup "$@" ;;
            *) usage ;;
        esac
        ;;
    license)
        case "$action" in
            lookup) license_lookup "$@" ;;
            *) usage ;;
        esac
        ;;
    order)
        case "$action" in
            lookup) order_lookup "$@" ;;
            refund) order_refund "$@" ;;
            *) usage ;;
        esac
        ;;
    subscription)
        case "$action" in
            lookup) subscription_lookup "$@" ;;
            cancel) subscription_cancel "$@" ;;
            *) usage ;;
        esac
        ;;
    *) usage ;;
esac
