# Incident: AGE run-failure storm (2026-06-06) — Langfuse crash + Ollama 429 quota

## Symptom
AGE backlog tickets (AGE-498 children AGE-507/508; AGE-496→510/511 cluster) appeared "stuck" in todo with execution churn every ~5 min. Deeper look: **AGE had a 76% run-failure rate** — 14h window: 309 failed / 95 succeeded / 7 cancelled. error_code: 271 adapter_failed + 38 process_lost.

## Two independent root causes (found via embedded Postgres `heartbeat_runs` table)

### 1. Langfuse SDK crash (DOMINANT, self-inflicted) — FIXED
- Every failed run's stderr: `TypeError: isinstance() arg 2 must be a type, a tuple of types, or a union` in
  `/opt/hermes-venv/.../langfuse/_client/client.py:1396 _create_span_with_parent_context` →
  `opentelemetry/trace/__init__.py:616 use_span`; plus `'NoneType' object is not callable` in `langfuse/_client/propagation.py:275`.
- **langfuse↔opentelemetry version incompatibility.** The "fail-open" claim is FALSE for this code path — it throws during the
  adapter's span cleanup and corrupts `hermes_local` exit handling, so runs that exit code 0 (work done, context compacted) get
  marked `adapter_failed`.
- **Smoking gun:** 0/95 succeeded runs carry the error; 258/309 failed runs do.
- Source: the `observability/langfuse` plugin we RE-ENABLED in agentos-config PR #178 (juno/axel/ellis). FON/KAL never enabled it → stayed healthy (this is why FON-2 validated clean).
- **FIX APPLIED:** removed `observability/langfuse` from `plugins.enabled` in /opt/hermes-profiles/{juno,axel,ellis}/config.yaml
  (live, backed up as config.yaml.bak-langfuse-disable-*) + restarted hermes-gateway.service (04:56Z, new PID, 0 restarts, clean).
  Durable: agentos-config **PR #184** (branch fix/disable-broken-langfuse-age). MERGE to make permanent (deploy reverts otherwise).
- Verify post-fix: heartbeat_runs after 04:56:30Z have NO langfuse error; failure storm stopped.
- **Re-enable later** only after pinning compatible langfuse + opentelemetry versions and verifying truly fail-open.

### 2. Ollama Cloud 429 — session usage limit (NEEDS USER / billing)
- stdout: `API call failed after 3 retries: HTTP 429 - {'error': 'you (kaleidoscope) have reached your session usage limit,
  add extra usage: https://ollama.com/settings'}` → hermes exit 1 → adapter_failed.
- **110 runs hit this**, all in window 02:34→04:40Z (account hit cap ~02:34).
- **The Ollama account is SHARED fleet-wide** (named `kaleidoscope`; OLLAMA_API_KEY common across companies). So AGE's crash-storm
  retries burned the shared quota → 429s that would also starve FON/KAL. Fleet-wide single point of resource failure.
- The langfuse fix should sharply cut run volume (no more retry storm), which likely RELIEVES the 429 pressure. But the underlying
  shared-quota SPOF remains a user decision: upgrade Ollama plan / add usage, OR separate per-company keys, OR throttle run rate.

## Amplifier: broken recovery loop (Paperclip)
- Failed runs → `stranded_assigned_issue` recovery actions → ownership handed to Juno (CEO).
- Juno's corrective API calls ERROR: 401 (auth), 404 (recovery-actions endpoint), and **500 `invalid input syntax for type uuid`**
  because cleanup writes non-UUID strings (`no-run-id`, `age-507-cleanup`, `manual-ceo-triage`) into UUID columns (created_by_run_id,
  checkout_run_id). So locks didn't release cleanly → ~5min churn. Locks DID eventually self-clear (TTL) after ~20-40 min.
- recovery-actions endpoints 404 even with board key; issue PATCH silently ignores lock fields + assigneeId (read-only via that route).
- Existing patches related: 051-stranded-recovery, 056/057-recovery-attempt-cap, 038-interactions-runid-optional, 014-gateway-lock-adoption.
  This UUID-in-cleanup path isn't covered. Candidate for our own patch (Paperclip patches live at /docker/paperclip-ezk7/patches/,
  applied by docker-entrypoint.sh on container start).

## RUNAWAY USAGE ROOT CAUSE (why BOTH Ollama accounts maxed) — RESOLVED
- The Langfuse crash wasn't just an AGE problem — it was enabled FLEET-WIDE via config.yaml `plugins.enabled`.
  Affected (live): juno/axel/ellis (AGE), juno-fon/willa (FON), dex/diag/supervisor + others.
- Mechanism: every assignment run crashed (langfuse TypeError) → `automation` invocation_source mass-retried.
  24h fleet: automation 1117 runs / **852 retries** / 1031 failed; assignment 747 / 653 failed. ~1864 runs total,
  ~85% failed, EACH burned tokens before crashing in cleanup → AGE acct + FON acct ("kaleidoscope") both exhausted.
- Baseline proof: 2026-06-05 ~16:00-20:00Z (before langfuse enablement PR #178) = 11-49 runs/hr, ~0 failures (healthy/sustainable).
  After enablement = hundreds/hr, ~85% fail. So PR #178 (enable observability/langfuse) IS the regression.
- FIX (fleet-wide, durable): removed observability/langfuse from config.yaml `enabled` on ALL profiles, live + restart,
  + agentos-config PRs **#185** (juno/axel/ellis) and **#186** (dex/diag/supervisor), both MERGED. juno-fon not in repo
  (live-only, durable); willa repo already clean. NOTE: gateway live-edit alone gets reverted by deploy-hermes-profiles —
  the repo PR is what makes it stick (AGE's first live fix at 04:56 was reverted by a deploy ~05:xx until #185 merged 14:36).
- VERIFIED post-fix (14:42Z): 0 langfuse errors fleet-wide; remaining failures are ONLY ollama 429 (quota, self-heals on reset).
- RESIDUAL / follow-ups:
  1. Both Ollama accounts maxed until ~1-day reset; 429s are REJECTED requests (don't burn tokens) so harmless churn until then.
  2. Retry amplification: `automation` retried 852× in 24h. ROOT CAUSE: per-issue cap (056/057) doesn't stop a SYSTEMIC failure
     (many issues × per-issue cap = aggregate storm). **FIXED — ticket AGE-623, patch 059-recovery-agent-storm-breaker.patch**:
     agent-level breaker at enqueueStrandedIssueRecovery (services/recovery/service.js) — if an agent has >=10 FAILED
     recovery-sourced runs in 20 min, stop enqueueing (return null -> skip, no escalate). Fail-safe + self-healing. Applied live
     (container restarted ~11:48Z, API 200) + durable in /docker/paperclip-ezk7/patches/. Recovery sources funnel through that one
     fn: issue.continuation_recovery + issue.assignment_recovery (+ productive_terminal_continuation_recovery). NOTE: 056 appended a
     DUPLICATE automaticRecoveryAttemptsExhausted def (JS uses 2nd, cap >=4/2h) — harmless but worth dedup.
     Re-enable Langfuse safely = ticket AGE-624.
  3. Re-enable Langfuse only after pinning compatible langfuse + opentelemetry versions and verifying truly fail-open.
  4. The HERMES_LANGFUSE_* creds remain in 13 profile .env files (harmless while config.yaml disabled; they're just creds).

## VPS / DB access notes (for future incidents)
- Local session: SSH key NOT on disk → fetch from AWS SM `agentos/otis/vps_ssh_key` (us-east-1), chmod 600, ssh -i to root@100.117.92.5 (Tailnet).
- Paperclip runs in docker `paperclip-ezk7-paperclip-1`; **embedded Postgres** on socket /tmp port 54329, db `paperclip`, role `paperclip` (peer auth). Data dir /paperclip/instances/default/db.
- `heartbeat_runs` table = run records with status/error_code/exit_code/signal/stdout_excerpt/stderr_excerpt — the ground truth for run failures (the /runs/:id HTTP API 404s).
- Run SQL via: `echo "$SQL" | ssh ... 'docker exec -i paperclip-ezk7-paperclip-1 psql -h /tmp -p 54329 -U paperclip -d paperclip'` (pipe stdin to avoid quote-hell).
- Model config (config.yaml) for juno/axel/ellis all correct = glm-5.1:cloud / provider auto / ollama.com / ${OLLAMA_API_KEY}. sessionKeyStrategy=null is fleet default (not a bug). I also aligned Paperclip-side adapterConfig.model juno/ellis glm-5.1→glm-5.1:cloud (harmless metadata; NOT the fix).
