---
name: incident-paperclip-sluggishness-2026-06-18
description: 2026-06-18 Paperclip sluggishness — missing DB index + Ellis advisory lock deadlock cascade
metadata:
  type: project
---

**Incident: Paperclip sluggish/502s (~05:30–05:48 UTC 2026-06-18)**

Load avg reached 14+, API returning 502s, 10-15s DB queries stacking up.

### Root Cause 1: Missing index on heartbeat_runs (FIXED)

UI polls `GET /heartbeat-runs?limit=200` every 3-7s. Without a `(company_id, created_at DESC)` index, each query did a Parallel Seq Scan across all 48K rows + JSONB extraction from `context_snapshot` (288MB column). Query took **574ms, 241K buffer reads**.

**Fix:** Created `heartbeat_runs_company_created_desc_idx ON heartbeat_runs (company_id, created_at DESC)` → **6ms, 1104 buffer reads (92x speedup)**. Index persists in the Docker volume.

### Root Cause 2: Ellis advisory lock deadlock (cascade from RC1)

Slow DB queries backed up the Node.js event loop. `claimQueuedRun` marked runs as "running" but `executeRun` was stuck in the queue → zombie runs with no `process_pid`. The 30s heartbeat scheduler kept trying to start Ellis every tick, each attempt acquiring `pg_advisory_xact_lock(2077176775)` (djb2 hash of Ellis's agent ID `a3e4c733`). 9+ connections queued behind a holder stuck in `idle in transaction`.

**Fix:**
1. Terminated stuck DB connections (released advisory locks)
2. Paused Ellis via API
3. Cancelled 12 zombie runs via API
4. Resumed Ellis after DB stabilized

### Key diagnostics

```sql
-- Find advisory lock pile-up
SELECT pid, state, wait_event, now() - query_start AS duration, left(query,80)
FROM pg_stat_activity WHERE datname = 'paperclip' AND state != 'idle'
ORDER BY duration DESC;

-- Find which agent holds/waits for the lock
SELECT a.pid, l.objid, l.granted FROM pg_stat_activity a
LEFT JOIN pg_locks l ON l.pid = a.pid AND l.locktype = 'advisory'
WHERE a.datname = 'paperclip' AND a.query LIKE '%advisory_xact_lock%';
```

Lock key → agent ID mapping: `_hashAgentToInt32(agentId)` in `agent-start-lock.js` (djb2 hash).

### Indexes on heartbeat_runs (as of 2026-06-18)

- `heartbeat_runs_company_created_desc_idx` (company_id, created_at DESC) — **NEW, added this session**
- `heartbeat_runs_company_agent_created_idx` (company_id, agent_id, created_at DESC)
- Several others for status/liveness lookups

### Why

The `context_snapshot` JSONB column averages ~6KB/row compressed. Without the index, Postgres had to scan all 48K rows and decompress each to extract 8 JSONB fields. With the index, it walks 200 rows in order and only touches 200 TOAST reads.

**How to apply:** If queries on `heartbeat_runs` are slow: check EXPLAIN ANALYZE for Parallel Seq Scan on that table. The index should prevent it. If the index is missing after re-provisioning, recreate it.

### OPEN: AGE-1109 — Ellis 401 API errors root cause

Ellis still gets intermittent 401s on authenticated endpoints. This was the original trigger for her outage-causing behavior (2026-06-17). Still unresolved.
