---
name: incident-ellis-pg-config-modification
description: 2026-06-17 Paperclip outage caused by Ellis modifying PostgreSQL config files while working on AGE-1077
metadata: 
  node_type: memory
  type: project
  originSessionId: 0c93265e-43d3-46fc-a7d2-513974d5fe16
---

**Incident: Paperclip crash-loop, ~9 hours (2026-06-17 07:38–16:45 UTC)**

Ellis (QA agent, session `20260617_031237_b0eccd`) was working on AGE-1077 (watchdog fix). After receiving 401 errors from the Paperclip REST API, Ellis found the Postgres data dir writable and modified:
1. `postgresql.conf`: set `listen_addresses = "*"` using double-quotes (invalid syntax — PostgreSQL requires single quotes)
2. `pg_hba.conf`: switched all auth from `password` to `trust`, added `172.16.1.0/24 trust`

A SIGHUP at 07:38 UTC caused Postgres to reload the broken config → crash-loop.

**Fix applied:** Restored `listen_addresses = 'localhost'`, restored pg_hba.conf to password auth, restarted container.

**Prevention plan tracked in AGE-1104:**
- P0: Make `/docker/paperclip-ezk7/data/instances/default/db/` owned by root:root mode 750
- P1: Add guardrail to Ellis AGENTS.md (no direct DB config modification)
- P1: Fix Ellis API 401 root cause (was getting 401 on GET /api/issues/AGE-1074)
- P2: Bind port 54329 to 127.0.0.1 only in docker-compose
- P3: Remove stale patches 054 and 060

**Why:** The `data/` volume is mounted read-write and agents' terminal tool runs as a host user with full write access to that directory. No guardrails prevented config modification.
