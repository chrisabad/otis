# PRD: Webhook Handler Migration to Hermes (AGE-12619)
**AGE-12619** | 2026-05-05 | Otis

## Problem

The smart-webhook-proxy (port 18789) currently forwards validated webhook payloads to OpenClaw gateway at port 18790. OpenClaw gateways at 18790 and 18793 are dead (connection refused — decommissioned as part of Phase 4 Hermes migration). All incoming webhooks from Linear, Figma, Vercel, and Frame.io are returning **Bad Gateway** and are silently dropped.

This means Juno is not receiving any webhook-triggered notifications (Linear @mentions, Figma file events, Vercel deployment failures).

## Architecture

**Current (broken):**
```
External → hooks.kaleidoscope.studio → smart-webhook-proxy:18789
  → HMAC verify → transform to {message, name, deliver, channel, accountId, to}
  → POST /hooks/agent → OpenClaw:18790 (DEAD → Bad Gateway)
```

**Target:**
```
External → hooks.kaleidoscope.studio → smart-webhook-proxy:18789
  → HMAC verify → transform to {message: "...", ...}
  → POST /webhooks/{linear|figma|vercel} → Hermes webhook platform:8644
  → Hermes extracts {message} via prompt template → Juno agent run
```

## Changes

### 1. `~/.hermes/profiles/juno/config.yaml`
Add `platforms.webhook` section:
```yaml
platforms:
  webhook:
    enabled: true
    extra:
      host: "0.0.0.0"
      port: 8644
      routes:
        linear:
          secret: "INSECURE_NO_AUTH"
          prompt: "{message}"
        figma:
          secret: "INSECURE_NO_AUTH"
          prompt: "{message}"
        vercel:
          secret: "INSECURE_NO_AUTH"
          prompt: "{message}"
```

`INSECURE_NO_AUTH` is correct here — HMAC validation already happens in smart-webhook-proxy before the payload reaches Hermes. Double-validating would require duplicating secrets.

The `{message}` template extracts `payload["message"]` from the proxy's forwarded JSON — the proxy builds a fully formatted agent prompt and wraps it as `{"message": "...", "name": "...", ...}`.

### 2. `~/.smart-webhook-proxy/smart-webhook-proxy.mjs`
- Replace `GATEWAY_PORT = 18790` / `GATEWAY_URL = http://127.0.0.1:18790` with per-route Hermes URLs
- Linear forward: `http://127.0.0.1:8644/webhooks/linear`
- Figma forward: `http://127.0.0.1:8644/webhooks/figma`
- Vercel forward: `http://127.0.0.1:8644/webhooks/vercel`
- Default transparent forward: remove (OpenClaw is gone; unknown routes are dropped with 501)

## Files
- `~/.hermes/profiles/juno/config.yaml` (add platforms.webhook section)
- `~/.smart-webhook-proxy/smart-webhook-proxy.mjs` (update forward targets)

## Peer Review
@Quinn — Does this change to Juno's config.yaml affect your verification workflow? The webhook platform addition doesn't change Juno's LLM routing, memory, or Slack delivery — it adds a new inbound channel. No objection expected.

## Acceptance
- `curl http://127.0.0.1:8644/health` returns 200 after Juno gateway restart
- `curl -X POST http://127.0.0.1:8644/webhooks/linear -H "Content-Type: application/json" -d '{"message": "test"}'` returns 200
- smart-webhook-proxy logs show "Hermes responded 200" for each route
- No Bad Gateway errors in smart-webhook-proxy logs
