# Per-Business Onboarding Runbook (Paperclip on Hostinger)

**v1.0 — 2026-06-03 — Author: Otis**

How to stand up a new Paperclip business (company) on the live system **safely** — i.e. with the anti-phantom-completion gate, role separation, and crash-safe observability from day one. Derived from production learnings running AGE (see `memory/project_phantom_gate_and_reliability.md` and the Cloud Migration PRD §3.5).

> **Golden rule:** a company is NOT ready to take real work until it (a) has a distinct **qa** + **ceo** + **worker** agent set, and (b) its `default_execution_policy` gate is provisioned. Onboarding agents before the gate = phantom completions.

---

## 0. Prerequisites (one-time, fleet-wide)
- [ ] **G2** reviewer-rigor + anti-confabulation merged (PR #162) — reviewers verify, agents don't fabricate "done".
- [ ] **G1** gate auto-provisioning wired into deploy (`scripts/ensure-all-companies-gate.sh` called from `start-paperclip.sh`). Until wired, run it manually after step 3 below.
- [ ] Langfuse stays **disabled** until AGE-354 (fail-open) lands. Do not enable per-agent Langfuse.

## 1. Create the company
- [ ] Create the company record in Paperclip (UI or API).
- [ ] Record the `companyId` and add it to this runbook's tracking table.

## 2. Create the agent roster (BEFORE any issues)
Minimum viable gate-ready roster:
| Role | Purpose | Gate position |
|---|---|---|
| `ceo` | orchestrator / approver | **approval** stage |
| `qa` | reviewer | **review** stage |
| `engineer` (≥1) | does the work | worker (assignee) |

- [ ] Create each agent record.
- [ ] Mint per-agent secrets in AWS Secrets Manager (Paperclip key, Ollama keys). Note: some `pcp_` keys are injected via adapterConfig, not AWS — verify both paths.
- [ ] Create the Hermes profile for each agent pointing at the live Paperclip URL.
- [ ] Configure the Ollama Cloud credential pool (×2 accounts, `least_used`).
- [ ] **Do NOT enable the Langfuse plugin** (see §0).

## 3. Provision the gate
- [ ] Run `scripts/ensure-all-companies-gate.sh` (or rely on deploy wiring once G1 lands).
- [ ] Verify: the company shows ≥2 policy stages (review→approval) using **its own** qa+ceo agents:
  ```
  docker exec -e PGPASSWORD=paperclip paperclip-ezk7-paperclip-1 \
    psql -h /tmp -p 54329 -U paperclip -d paperclip -tAc \
    "SELECT name, jsonb_array_length(default_execution_policy->'stages') FROM companies;"
  ```
- [ ] **Worker ≠ approver invariant:** confirm the default assignee/worker for new issues is NOT the ceo/approver. If the orchestrator (ceo) is the only candidate worker, the gate self-rubber-stamps — add an engineer first.

## 4. Smoke-test the gate (do this BEFORE wiring real triggers)
- [ ] Create a throwaway issue with NO explicit policy. Confirm it **auto-inherits** the gate (review→approval stages present). Cancel it.
- [ ] Assign a real test issue to an engineer. Confirm completion routes to `in_review` (qa), **not** straight to `done`.
- [ ] Confirm the qa reviewer actually verifies (checks for a real PR/artifact) — not a rubber-stamp.

## 5. Wire the business pipeline
- [ ] Repoint the business's external triggers (webhooks, etc.) to the live Paperclip endpoint.
- [ ] Recreate any cron routines.
- [ ] Run one real end-to-end transaction and watch it through the gate.

## 6. Watch window (first 24–48h)
Monitor and confirm:
- [ ] `adapter_failed` stays ~0 (no Langfuse, no adapter crashes).
- [ ] No **phantom completions** (issues `done` with a real artifact/PR every time).
- [ ] No **orchestrator cascade sprawl** (ceo not accumulating a runaway queue / mass completions) — the AGE-352 failure mode.
- [ ] No agents stuck in `error`.

## 7. Known gaps to watch until fixed
| Gap | Risk during onboarding | Ticket |
|---|---|---|
| Cascade overload (no load cap on recovery) | orchestrator sprawl + mass phantoms | AGE-352 |
| Shared deploy checkout collisions | agents leave `agentos-config` on a feature branch → bad restart | AGE-353 |
| Stale queued runs can't be cancelled | parked issues bounce back to active | (part of AGE-352) |
| Langfuse not fail-open | re-enabling crashes the fleet | AGE-354 |

---

## Tracking
| Business | companyId | Roster ready | Gate provisioned | Pipeline wired | Live |
|---|---|---|---|---|---|
| AGE | f4593f38-… | ✅ | ✅ | ✅ | ✅ |
| Kaleidoscope | (KAL) | ❌ (1 agent) | ❌ (can't form gate) | — | deferred |
| FON | TBD | | | | Phase 2a |
| PER | TBD | | | | Phase 2b |
