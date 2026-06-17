# Phantom-completion, the execution-policy gate, and fleet reliability (2026-06-03)

## Phantom completion — what it is and how it's prevented
- **Phantom completion**: an agent marks an issue `done` with no real deliverable (no PR/code). Often paired with **confabulation** (fabricated "✅ implemented and verified, ready for deployment" comments). Root enabler: issue had **no executionPolicy**, so the worker could self-mark `done` unverified.
- **Fix = the execution-policy gate.** With a review→approval policy, finishing work routes the issue to `in_review` (reviewer) → `approval` (approver) before it can reach `done`. A phantom "done" gets caught at review instead of landing silently.
- **Two parts, both required:**
  1. `patch 053` (issue-create-execution-policy-fallback) — at issue CREATE, if no policy given, inherit company/project `default_execution_policy`. VERIFIED WORKING (throwaway AGE-356 auto-inherited review→approval).
  2. Company `default_execution_policy` in DB — set via `paperclip-patches/backfill-age-default-execution-policy.sh` (idempotent; `--force` to overwrite). Policy = review(Quinn 67f1e093) → approval(Juno a38cd7bc), commentRequired.
- **GOTCHA**: the API GET /companies/{id} returns `defaultExecutionPolicy: null` even when the DB HAS it — the field is NOT serialized. Do NOT trust the API null; check the DB (`jsonb_array_length(default_execution_policy->'stages')`). This misled diagnosis for a while.
- **Worker ≠ approver.** If the issue assignee (worker) == the approval-stage agent (Juno), it's a self-rubber-stamp and the gate is useless. Always assign a non-Juno worker (e.g. Axel) when Juno is the approver. The cascade sometimes re-grabs issues for Juno — re-assert the intended worker.
- **Gate only fully works if reviewers VERIFY** rather than rubber-stamp. AGE-350/351 (reviewer verify-before-claiming + auth minting) and AGE-355 (anti-confabulation rule in SOUL.md) are the reviewer-rigor half. As of 2026-06-03 these are in **PR #162** (agentos-config), NOT merged.

## DB access (embedded postgres inside the Paperclip container)
- No host TCP / no DATABASE_URL env. Connect from the HOST:
  `docker exec -e PGPASSWORD=paperclip paperclip-ezk7-paperclip-1 psql -h /tmp -p 54329 -U paperclip -d paperclip`
- The `paperclip-patches/*.sh` helper scripts use `docker exec` internally → run them FROM THE HOST, not inside the container.

## Langfuse adapter_failed (the only real crash this era — FIXED)
- Langfuse observability plugin threw span exceptions → `adapter_failed` errorCode → 3 strikes → agent error state. **Model-agnostic** (hit Axel/gpt-oss, Juno/glm, Ellis, Quinn alike). Disabled fleet-wide in agent .env (commented HERMES_LANGFUSE_*, stripped /paperclip/langfuse_libs from PYTHONPATH). 0 adapter_failed since disable. AGE-354 = fail-open follow-up (backlog).
- There is **NO gpt-oss 401/auth bug** — that was confabulation. Zero 401 errorCodes ever in run data. Do not re-derive that theory.

## Structural reliability gaps (UNFIXED — multiply under multi-tenancy)
- **AGE-352 cascade overload (keystone)**: recovery dumps a stranded agent's whole queue on the orchestrator (Juno) with no load cap / domain check → sprawling sessions → mass phantom completions. Also: stale QUEUED runs can't be cancelled (no primitive; pause doesn't drain them) → parked issues bounce back to active.
- **AGE-353 shared-checkout collision**: Otis + agents share `/paperclip/repos/agentos-config`. Agents commit feature branches INTO the deploy checkout (found it stranded on `age-355-anti-confabulation` instead of main → a restart would apply patches from a feature branch). Manually reset to main + preserved work (PR #162) on 2026-06-03; structural fix (agents use worktrees, never deploy checkout) not landed.
- **AGE-297**: phantom-blocked auto-recovery plugin code — never landed; Otis runs the equivalent sweep manually.

## Multi-tenant state (2026-06-03)
- Companies: **AgentOS Infrastructure (AGE)** — 2 policy stages, 352 issues, 8 agents (live). **Kaleidoscope** — 0 policy stages, 0 issues, 1 agent (empty scaffold, PHANTOM-VULNERABLE: no gate). `backfill-wee-*.sh` exists (a third tenant "WEE" intended, not in DB).
- Per-tenant gate provisioning is MANUAL (run the backfill script per company). New companies get NO gate by default → not safe to expand without automating this.
