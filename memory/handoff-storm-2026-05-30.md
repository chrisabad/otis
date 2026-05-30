# Handoff — Storm Incident 2026-05-30 (mid-session, picking up in new session)

## Immediate situation

A flood of run failures hit immediately after restarting the Paperclip container (`docker restart paperclip-ezk7-paperclip-1`). All failures are **Juno**, all error: `"Adapter failed"`, ~191 in ~5 minutes.

**Kill-switch applied:** All agents are currently `paused` (Quinn, Vera, Orion, Axel, Dex, Ellis, Juno). Nothing is running. The fleet is safe but stopped.

## Why the storm wasn't auto-blocked

AGE-115 circuit breaker only caps *recovery* loops (4 runs/2h). This was a *dispatch* flood — new runs, not retries. No automatic rate limit exists for dispatch failures. Gap needs an AGE issue once root cause is resolved.

## Root cause: unknown, diagnosis in progress

- All 191 failures = Juno + "Adapter failed"
- Timing: started immediately after container restart
- Suspected causes (not yet confirmed):
  1. The routing-rules.json change (dispatcher role removed) broke something in how Juno is invoked after restart
  2. Backed-up queue flushed all at once post-restart and hammered Juno before its adapter was ready
  3. Something in Juno's adapter config broke (provider? key? model?)
- Could NOT confirm root cause — auto-mode permission blocks prevented reading Juno's DB adapter config and log files

## What to do in the new session

1. **Diagnose Juno adapter failure** — check:
   - `docker logs paperclip-ezk7-paperclip-1 --since 30m` for adapter errors
   - `/opt/hermes-profiles/juno/logs/` latest log
   - Juno's `adapter_config` in the DB (provider, model, apiKey present?)
   - Whether routing-rules.json change is the culprit (try reverting dispatcher role temporarily)

2. **Fix root cause**, then re-enable agents one at a time:
   - Start with Axel or Ellis (lower blast radius)
   - Juno last — she's the one failing

3. **File AGE issue** for dispatch-failure rate limit (auto-pause agent after N failures/window)

## SSH access (for this machine)

Key already fetched to `/tmp/otis_vps_key` (may still be there). If not, re-fetch from AWS Secrets Manager `agentos/otis/vps_ssh_key` and **append a trailing newline** (`echo "" >> /tmp/otis_vps_key`) before using.

VPS: `ssh -i /tmp/otis_vps_key -o StrictHostKeyChecking=no root@100.117.92.5`

## Routing change context

The container restart was done to apply staged routing changes (dispatcher role removed from routing-rules.json for FON + 6 other companies). AGE routing was already live before the restart. The restart may have exposed a bug in how the new routing interacts with Juno's adapter.
