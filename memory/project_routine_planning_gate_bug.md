---
name: routine-planning-gate-bug
description: "Known plugin bug: routine-generated issues land in backlog due to planning gate; AGE-1089 filed for fix."
metadata: 
  node_type: memory
  type: project
  originSessionId: 77493503-f693-4bc5-90c7-fe460c44a9b5
---

Routine-generated issues (`originKind == routine_execution`) get `workMode: planning` set by the plugin's onboarding sweep, which puts them in backlog awaiting a CEO plan. This is wrong — routine issues already have a full description and assignee.

**Why:** Plugin applies planning gate to all new top-level issues without checking `originKind`. Compounded by `concurrencyPolicy: coalesce_if_active` — once stuck in backlog, every new run coalesces into the same stuck issue.

**Fix (in progress):** AGE-1089 — Axel to patch `paperclip-issue-trigger` to skip the planning gate when `issue.originKind === 'routine_execution'` and set `status: todo` + `workMode: standard` instead.

**How to apply:** Until AGE-1089 ships, routine execution issues will land in backlog and need manual promotion to `todo`. If a routine appears stuck (same issue in backlog across multiple days), cancel the stuck issue — the next scheduled run will create a fresh one, and manually promote that one to `todo`.
