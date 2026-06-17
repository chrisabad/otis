---
name: age-backlog-grooming-2026-06-16
description: "AGE backlog groomed 2026-06-16 — cancelled stale issues, promoted actionable ones, fixed routine deadlock pattern, filed plugin fix task."
metadata: 
  node_type: memory
  type: project
  originSessionId: 77493503-f693-4bc5-90c7-fe460c44a9b5
---

Backlog groomed 2026-06-16. Backlog is now empty.

**Cancelled:** AGE-964 (test junk), AGE-1081 (test junk), AGE-1063 (duplicate CI branch protection), AGE-981 (nightly docs sync deadlock — see below), AGE-958 (Infisical/Agent Vault — deferred indefinitely per Chris).

**Promoted to todo:** AGE-862 (CI branch protection checks:read fix), AGE-1043 (Routine Health Monitor), AGE-824 (System Audit R&D Loop), AGE-625 (AC parser audit), AGE-1060 (Deploy I&M Notifications Service to VPS), AGE-1084 (plugin: daily backlog promotion sweep).

**Why:** Stack of stale issues was bogging down Juno's queue. Chris wants to see a run of autonomous productivity before taking on major infra changes (hence AGE-958 cancelled outright).

**Routine deadlock pattern (AGE-981):** Nightly docs sync was stuck because:
1. Plugin sets `workMode: planning` on all new top-level issues → issue lands in backlog
2. Routine has `concurrencyPolicy: coalesce_if_active` → every new run coalesces into the stuck backlog issue instead of creating a fresh one
3. Result: routine never executes, backlog grows a permanent stuck item

**Fix filed:** AGE-1089 — "Plugin: skip workMode=planning gate for routine-generated issues" — assigned to Axel, already in_progress. Fix: if `issue.originKind === 'routine_execution'`, skip planning gate and set `status: todo` + `workMode: standard` directly.

**Duplicate triggers removed:** Nightly docs sync routine had 3 identical `0 2 * * *` triggers. Two deleted via `DELETE /routine-triggers/:id`. One canonical trigger remains.

**How to apply:** If a routine's execution issues accumulate in backlog, check for: (1) `workMode: planning` being set, (2) `concurrencyPolicy: coalesce_if_active` locking to the stuck issue. Cancel the stuck issue to break the deadlock; it will recreate fresh next run.
