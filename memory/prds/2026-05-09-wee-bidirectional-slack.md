# PRD: Enable WEE Bidirectional Slack Outbound (revert AGE-12554)
**Date:** 2026-05-09
**AGE Issue:** AGE-13333
**Author:** Otis
**Type:** Structural

## Objective
Re-enable Juno (Hermes) outbound Slack from the Weekend (WEE) workspace so WEE-scoped business (Slate, slate-canvas, WEE-* issues, Volley channels) is communicated in WEE rather than crossing into Kaleidoscope (KAL).

## Background
- AGE-12554 (commit `82932b8`, 2026-05-05) locked the WEE OpenClaw juno app to ingestion-only by setting three flags on `channels.slack.accounts.weekend`: `dmPolicy: disabled`, `groupPolicy: disabled`, `replyToMode: off`. Quinn passed; Ellis approved.
- Original rationale: workspace-admin friction blocked installing a fresh Hermes Juno Slack app in WEE, so KAL handled all outbound to avoid scope-shortage on the WEE side.
- Constraint dissolved per `project_wee_juno_slack_app_repurpose.md`: we are repurposing the existing OpenClaw juno user (`U0AGVGG79MX`), already a member of 15 WEE private channels and capable of posting.
- Chris confirmed 2026-05-08: "Yes, let's use WEE DM for all things WEE related."

## Files to be Changed
- `agentos-config/openclaw-schema.json` — `channels.slack.accounts.weekend` block (~line 2373)
  - `dmPolicy: "disabled"` → `"allowlist"` (matches KAL)
  - `groupPolicy: "disabled"` → `"open"` (matches KAL)
  - `replyToMode: "off"` → `"all"` (matches KAL)
  - `allowFrom: ["U08EJGZ3P9B"]` — unchanged (still gates inbound DMs to Chris-only)
  - Channel-level `allow: false` — unchanged (governed by AGE-13334 broker work)

## Cross-Agent Impact
- **Juno (Hermes, WEE binding):** can now send DMs to Chris and post in groups/threads. WEE-scoped alerts stop crossing to KAL.
- **Sage (WEE routing):** outbound flow widens; existing WEE inbound routing untouched.
- **Other agents:** no behavior change; only the WEE Slack account config flips.
- **Chris:** WEE-related Juno alerts arrive in WEE workspace going forward (the desired end state). KAL alerts still arrive in KAL.

## Acceptance Criteria
- [ ] `agentos-config/openclaw-schema.json` flipped on three keys; JSON validates.
- [ ] Schema synced to runtime (`~/.openclaw/openclaw.json`); gateway restarted via maintenance-work.
- [ ] WEE-scoped Juno outbound (heartbeat WEE board check or manual ping) lands in WEE workspace as a DM to Chris.
- [ ] Inbound from Chris's WEE user (`U08EJGZ3P9B`) reaches Juno and gets a WEE-thread reply.
- [ ] KAL outbound continues to work (no regression).
- [ ] No agents other than Juno appear in WEE with new posting capabilities (allowlist preserved).

## Rollback Plan
- Restore prior `openclaw-schema.json` (3 keys back to `disabled`/`disabled`/`off`).
- Re-sync to `~/.openclaw/openclaw.json`.
- Restart gateway.
- Tracking commit: AGE-12554 / `82932b8` is the prior known-good state for these three keys.

## Peer Review
@mention: **Sage** — WEE routing domain. "Reverting the three AGE-12554 keys on `channels.slack.accounts.weekend` (`dmPolicy: allowlist`, `groupPolicy: open`, `replyToMode: all`). Any concern with this from a routing perspective? Channel-level `allow:false` flags stay (broker work in AGE-13334)."
30-min window opens: 2026-05-09 10:45 PT (post time of comment).
Result: pending.
