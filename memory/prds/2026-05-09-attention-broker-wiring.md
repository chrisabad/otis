# PRD: Wire Attention Broker into Juno Send Path
**Date:** 2026-05-09
**AGE Issue:** AGE-13334
**Author:** Otis
**Type:** Large

## Objective
Integrate the attention broker (`http://127.0.0.1:8011/broker/*`) into Juno's outbound Slack send path so proactive alerts route to topic channels resolved from `(business, category, surface_tier)` instead of defaulting to Chris's DM.

## Background
Observed 2026-05-08: every Juno proactive alert (WEE-1947 hero canvas, slate-canvas blockers, FON-185 LegalZoom reminder, Granola watcher OAuth ask, etc.) lands as a Chris DM in both KAL and WEE. None routes to a topic channel.

The attention broker is fully *defined* — `agentos-config/hermes/profiles/juno/skills/im-services/attention-broker/SKILL.md`, broker endpoints documented at `/broker/check`, `/broker/topic`, `/broker/record-action`, `/broker/disposition`, Juno's SOUL.md asserts "I never bypass the broker." It is not *integrated*. Searching `openclaw-llm-proxy/src/` and `openclaw/src/` for `/broker/check` or `attention-broker` returns only docs and `agentos-config/scripts/attention-broker/stale_resolver.py`. No live caller on the send path; default fallback is to DM the human.

## Files to be Changed (preliminary; engineering refines during scoping)
- `openclaw-llm-proxy/src/` — Hermes Juno send path; pre-send broker call to resolve channel
- `openclaw/src/infra/outbound/deliver.ts` — gateway delivery may need broker-aware target resolution
- `agentos-config/hermes/profiles/juno/config.yaml` — confirm broker URL is configured and reachable from runtime
- `(new)` channel-mapping data source — `(business, category) → channel_id`; format and home TBD during scoping

## Cross-Agent Impact
- **Juno:** primary subject. Outbound behavior changes from "always DM" to "broker-resolved channel, fallback DM."
- **Other Hermes agents:** if broker integration is centralized in the proxy, all Hermes agents inherit broker-routed outbound. Phase rollout to Juno-only first if needed.
- **Chris:** alerts surface in topic channels (`#slate-canvas`, `#agent-ops`, etc.) instead of DM clutter. Critical/personal items still DM.
- **OpenClaw agents (non-Hermes):** out of scope unless gateway-side delivery is modified; flag during scoping.

## Acceptance Criteria
- [ ] WEE-scoped Juno alert (e.g. WEE-1947 update) posts to a slate-canvas channel in WEE — depends on AGE-13333 landing first.
- [ ] AGE-scoped Juno test alert with `business=AGE, category=infra, tier=routine` lands in `#agent-ops` (KAL) or equivalent.
- [ ] Broker-down test: outbound still delivers via DM fallback, with audit log entry confirming fallback path.
- [ ] Post-send `record-action` writes appear in broker history for surface-tier learning.
- [ ] DM remains the path for tier=personal / tier=critical-direct messages.
- [ ] No regression in KAL inbound conversational threads (Juno still replies in-thread to Chris's DMs).

## Rollback Plan
- Feature-flag the broker call (e.g. `FEATURE_ATTENTION_BROKER=1`); rollback is flag-off + redeploy.
- Code-level rollback: revert PR; restart gateway and Hermes proxy.
- Backed by canary period: enable in KAL only, observe for 24h, expand to WEE.

## Dependencies
- **AGE-13333** (WEE bidirectional unlock) lands first so broker routing has a real WEE target.
- **Channel-mapping data:** owner and format need to be decided during scoping. Candidates: a new YAML alongside the broker, or extend `agentos-config/openclaw-schema.json`. Likely a sub-issue.

## Peer Review
@mention: **Finn** — CI/CD/coding domain. "Wiring the attention broker into Juno's outbound send path — most likely in `openclaw-llm-proxy/src/`, possibly `openclaw/src/infra/outbound/deliver.ts`. Cross-fork PR per `feedback_paperclip_changes_via_pr.md`. Want your read on whether this should sit in the Hermes proxy (per-agent) or the gateway (centralized for all agents) before we scope sub-issues."
30-min window opens: 2026-05-09 10:45 PT (post time of comment).
Result: pending.

## Reviewer chain
Quinn (peer review on PR) → Ellis (approval on PR).
