# Per-Business Onboarding Runbook (Paperclip on Hostinger)

**v2.0 — 2026-06-03 — Author: Otis**

How to stand up a new Paperclip business safely and minimally, using Paperclip's **native roles** so native routing/recovery work *for* us. Derived from production learnings running AGE (see `memory/project_phantom_gate_and_reliability.md` and Cloud Migration PRD §3.5).

---

## 1. The role template (minimum viable workflow)

Three workflow roles, mapped onto Paperclip's native role enum so that **dispatch and recovery route by role automatically**:

| Workflow role | Paperclip role | Job | Never does | GitHub identity needed |
|---|---|---|---|---|
| **Orchestrator** | `ceo` | dispatch, prioritize, human interface | implement; approve code | none (read/comment only) |
| **Implementer** | `cto` | does the work, opens PRs; **scales by concurrency** | approve own work | **App** (push + open PRs) |
| **Reviewer/Approver** | `qa` *(label only)* | reviews + **approves + merges PRs in GitHub** | implement | **machine-USER + PAT** |

> **CTO = implementer.** Paperclip's recovery routes stranded issues to `cto` first, then `ceo`. By making the implementer the `cto`, native recovery lands stranded work on the implementer — never on the orchestrator/approver. (The AGE cascade bug existed precisely because AGE had a `ceo` but **no `cto`**, so recovery fell through to the CEO.)

**Above the template:** **Otis** = fleet COO (cross-business oversight). **Chris** = human escalation / approver of last resort.

Native role enum, for reference: `ceo, cto, cmo, cfo, security, engineer, designer, pm, qa, devops, researcher, general`.

---

## 2. Invariants (the hard rules every business inherits)

1. **Maker ≠ Approver.** The `cto` (implementer) never approves; the approver never implements.
2. **Code `done` = merged PR.** GitHub is the gate; the plugin auto-sets `done` on merge. **No Paperclip approval stage.**
3. **Recovery routes to the `cto`** (native) = the implementer — never to the `ceo`/approver. **Always have a `cto`** so recovery never falls through to the `ceo`.
4. **The `ceo` (orchestrator) is never an issue assignee.**
5. **Scale = more concurrent runs on the `cto`**, not more agents.
6. **Routing = by role** (native Paperclip style): implementation/code → `cto`; triage/orchestration → `ceo`.

---

## 3. GitHub identities (what each role actually needs)

- **Implementer (`cto`)** → **GitHub App** (push, open PRs). Apps *cannot approve* PRs — fine, the implementer doesn't approve.
- **Reviewer/Approver** → **GitHub machine-USER + PAT** with write access. **GitHub Apps cannot submit PR approvals** — so this role must be a real user identity, not an App. This is the only role that requires a user.
- **Orchestrator (`ceo`)** → none required (read/comment at most).
- Not every agent needs a GitHub identity. Only the implementer (App) and approver (user).

---

## 4. Gate model (one gate, the artifact)

- **Code issues:** `in_progress` (cto) → PR opened → `in_review` → reviewer **approves + merges in GitHub** → plugin detects merge → **`done`**. No agent manually sets `done`; phantom completion is impossible (no merged PR → no `done`).
- **Non-code issues** (decisions/ops/docs not via PR): lightweight — proof-of-work evidence + orchestrator marks `done`. No GitHub artifact, so no merge gate.

---

## 5. Onboarding steps (per business)

1. **Create the company** (record `companyId`).
2. **Create 3 agents** with native roles: `ceo` (orchestrator), `cto` (implementer), `qa` (reviewer/approver).
3. **GitHub identities:** App for the `cto`; machine-USER + PAT for the approver; orchestrator none.
4. **Routing rules:** dispatch implementation/code by `role = cto`; triage/orchestration by `role = ceo`.
5. **Verify invariants:** a `cto` exists; `ceo` is never an assignee; maker ≠ approver.
6. **Smoke test:** create a throwaway issue, confirm it **cannot reach `done` without a merged PR**; cancel it.
7. **Watch window (24–48h):** `adapter_failed` ~0; no phantom `done`; no orchestrator sprawl; no agents stuck in `error`.

---

## 6. DB / ops reference
- Embedded postgres (from host): `docker exec -e PGPASSWORD=paperclip paperclip-ezk7-paperclip-1 psql -h /tmp -p 54329 -U paperclip -d paperclip`
- Set an agent's role: `UPDATE agents SET role='cto' WHERE id='…';`
- Agent token minting: `/opt/hermes-profiles/<agent>/bin/mint-github-token.sh` (needs `app-id.txt`, `private-key.pem`, `installation-id.txt`).
- Raise concurrency: `AGENT_DEFAULT_MAX_CONCURRENT_RUNS` (default 20) / per-agent max-concurrent-runs.

---

## 7. AGE migration to this template (exact changes)

| Agent | Change |
|---|---|
| **Juno** | Keep `ceo`. Ensure a `cto` exists so recovery never targets her. Confirm she's never an issue assignee. Drop the shared GitHub App (not needed). |
| **Axel** | Role `engineer` → **`cto`**. Keep GitHub App. Raise max concurrent runs (replaces needing more engineers). |
| **Ellis** | Becomes **Reviewer/Approver**. **Needs a GitHub machine-USER + PAT** (currently has App `3590091` which *cannot approve*). Role → `qa` (or keep `devops`). |
| **Orion** | Retire/defer (redundant 2nd implementer). |
| **Quinn, Vera, Dex** | Retire/defer (redundant; have mint scripts but no credentials). |
| Plugin routing rules | Dispatch code by `role = cto` (was `engineer`). |
| Execution policy | Drop the approval stage (company default + per-issue). Code gated by GitHub merge. |

**Blockers requiring Chris:**
- **Ellis machine-USER + PAT** (GitHub account creation) — turns "GitHub is the gate" from theory into reality.
- Pushing/merging the trapped **AGE-352** branch (App lacks `workflows` permission; merge needs review approval).

---

## 8. Known gaps to watch until fixed
| Gap | Risk | Ticket |
|---|---|---|
| Cascade load on a single implementer if stranded repeatedly | re-queue storms | AGE-352 (load cap exists on trapped branch) |
| Shared deploy-checkout collisions | agents leave repos on feature branches | AGE-353 |
| Langfuse not fail-open | re-enabling crashes fleet | AGE-354 |

---

## Tracking
| Business | companyId | ceo | cto | reviewer/approver | Gate verified | Live |
|---|---|---|---|---|---|---|
| AGE | f4593f38-… | Juno | Axel (pending role flip) | Ellis (pending machine-user) | partial | ✅ |
| FON | TBD | | | | | Phase 2a |
| PER | TBD | | | | | Phase 2b |
