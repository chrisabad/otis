# Per-Business Onboarding Runbook (Paperclip on Hostinger)

**v3.0 — 2026-06-05 — Author: Otis** — _§9 is the current model (no plan-approval gate; SOUL.md instruction surface; per-agent App-auth wrapper); use it to stand up PER._

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
2. **Code `done` requires a separate reviewer's PASS verdict AND a real merged-PR artifact** (Paperclip execution-policy `review` stage → reviewer approves). This enforces Maker ≠ Approver and blocks self-completion. **AGE-392 (the artifact gate) — two layers, both live:**
   - **Plugin detection (deployed, plugin v1.59+):** before a CODE issue advances to `done`, the worker checks `hasCompletionArtifact` — a leaf issue must have a **MERGED** GitHub PR (verified via the GitHub API, App token); a planning parent must have **all subtasks `done`**. On failure it reverts to `in_progress`, reassigns the implementer, and posts an `**AGE-392 gate:**` comment.
   - **Reviewer discipline (deployed, agentos-config PR #171):** the plugin *detects* but **cannot itself force-revert** an execution stage — only the active reviewer/approver can advance/revert it (a board-key PATCH gets `422 "Only the active reviewer or approver can advance the current execution stage"`). So the reviewer agent's AGENTS.md (Ellis/Tess) is the enforcement point: **find the linked PR → confirm `gh pr view` state is MERGED (merge it yourself with the approver PAT if open) → only then post PASS + advance.** No merged PR (or parent subtasks not all done) ⇒ FAIL, never `done`.
   - **Remaining hardening (server-side, NOT yet done):** deterministic enforcement that no reviewer can ever PASS over a missing artifact requires a **Paperclip server change** (the execution-policy engine validating the artifact before stage completion). Until then the gate = plugin detection + reviewer discipline. *(Corrects the earlier "merge alone = done, no Paperclip stage" model — the validated gate is the Paperclip review stage + the AGE-392 artifact check.)*
3. **Recovery routes to the `cto`** (native) = the implementer — never to the `ceo`/approver. **Always have a `cto`** so recovery never falls through to the `ceo`.
4. **The `ceo` (orchestrator) is never an issue assignee.**
5. **Scale = more concurrent runs on the `cto`**, not more agents.
6. **Routing = by role** (native Paperclip style): implementation/code → `cto`; triage/orchestration → `ceo`.
7. **PR identity model:** the **implementer App authors/opens every PR**; the **approver PAT approves + merges**. **Chris never authors or approves** routine PRs. Because the App (bot) and the PAT (`chrisabad`) are *distinct* identities, there is no self-approval bind — as long as the **bot always *opens* the PR** (authorship is set by who opens it, not who pushed the branch).

---

## 3. GitHub identities (official model)

Two identities run the whole loop — and they must be **distinct**:

- **Implementer (`cto`) → GitHub App.** Pushes work branches and **opens every PR** (author = bot). Apps *cannot approve* PRs — fine, the implementer doesn't approve.
- **Reviewer/Approver (Ellis) → a user PAT** (currently **Chris's `chrisabad` fine-grained PAT**, stored in AWS SM `agentos/ellis/github_approver_pat`). It **approves + merges**. Apps can't approve, so this must be a user identity.
- **Orchestrator (`ceo`) → none** (read/comment at most).

**Accepted trade-offs of using Chris's PAT (vs a dedicated bot user):**
- Approvals are attributed to **`chrisabad`** in GitHub history (can't distinguish auto-approval from a real human review). Accepted.
- Keep it a **fine-grained** token (PR R/W, Contents R/W, **Workflows R/W**, only the agent repos) and rotate periodically — it lives on the VPS.

**Workflow-file PRs** (`.github/workflows/*`): the App lacks `workflow` scope, so the **PAT pushes that branch**, but the **bot still opens the PR** (author = bot → PAT can still approve).

> A **dedicated bot machine-user** as the approver is now an *optional* future nicety (cleaner audit trail), **not** a required step.

---

## 4. Gate model (one gate, the artifact)

- **Code issues:** `in_progress` (cto) → PR opened (implementer App authors) → `in_review` → **reviewer (qa) merges the PR in GitHub THEN posts a PASS verdict** on the Paperclip `review` stage → issue → **`done`**. The implementer cannot self-complete (separate approver required). **AGE-392 artifact gate (live):** the plugin checks for a MERGED PR (leaf) / all-subtasks-done (parent) before allowing `done`, reverting + posting `**AGE-392 gate:**` on failure; and reviewer AGENTS.md mandates merge-before-PASS. Together: a confabulated `done` (no merged PR) is blocked. The plugin can only *detect* (it isn't the active stage owner — board-key advance/revert returns `422`); the reviewer agent is the enforcement actor. Deterministic, reviewer-independent enforcement is a pending server change.
- **Implementer push auth (AGE-407 fix):** a bare `git push` from an agent fails with "GitHub auth" — the App token must be **wired into the push** (`git remote set-url origin https://x-access-token:$TOKEN@github.com/...` or `export GH_TOKEN=$TOKEN` + `gh pr create`). ⚠️ **Diagnostic gotcha:** `GET /repos/{repo}.permissions.push` returns **`false` for App installation tokens even when they can write** — it's a user-permissions field, meaningless for Apps. To test an App token's write capability, do a real write (e.g. create+delete a git ref → expect `201`), not the `permissions` field. Implementer AGENTS.md (Axel/Willa) now carries explicit mint→wire→push steps (agentos-config PR #172).
- **Non-code issues** (decisions/ops/docs not via PR): lightweight — proof-of-work evidence + reviewer/orchestrator verdict. No GitHub artifact.

---

## 5. Onboarding steps (per business)

1. **Create the company** (record `companyId`).
2. **Create 3 agents** with native roles: `ceo` (orchestrator), `cto` (implementer), `qa` (reviewer/approver).
3. **GitHub identities:** App for the `cto` (authors/opens PRs); the approver PAT (Chris's, in AWS SM) approves+merges; orchestrator none. The bot opens every PR; Chris never authors/approves.
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
| Artifact gate not server-enforced — a misbehaving reviewer could still PASS over a missing PR (plugin detects + reverts, but can't force the stage; 422) | confabulated `done` if reviewer ignores discipline | AGE-392 (server-side enforcement pending) |
| Cascade load on a single implementer if stranded repeatedly | re-queue storms | AGE-352 (load cap exists on trapped branch) |
| Shared deploy-checkout collisions | agents leave repos on feature branches | AGE-353 |
| Langfuse not fail-open | re-enabling crashes fleet | AGE-354 |

---

## Tracking
| Business | companyId | ceo | cto | reviewer/approver | Gate verified | Live |
|---|---|---|---|---|---|---|
| AGE | f4593f38-… | Juno | Axel (`cto`) | Ellis (`qa`, chrisabad PAT) | ✅ validated end-to-end (dry-run AGE-366: real PR→done; phantom AGE-367 blocked) | ✅ |
| FON | `029fb83c-…` (prefix FON) | Juno-FON (`16adddf5`, never-heartbeat; not needed under no-approval) | Willa (`cto`, `2835530c`, **willa-bot-fon App — write to figma repo confirmed; wrapper now exports GH_TOKEN**) | Tess (`qa`, `e105f216`) | gate wired (routing-rules `029fb83c`, reviewRequired); autonomous e2e FON-2 in validation | 🟢 implementer+reviewer live; Piper/CS in separate session |
| PER | `9de6c4a9-…` (prefix PER) | orchestrator `2cdc9205` | implementer `3469f1fb` | **MISSING — add a reviewer (the gap)** | — | in routing-rules w/o reviewer; follow §9c checklist |

### FON provisioning checklist (shell live, agents pending)
**⚠️ Lesson (2026-06-04): do NOT improvise the roster.** The canonical FON roster already exists in `chrisabad/agentos-config` (`hermes/profiles/<agent>/SOUL.md`), built across many AGE tickets: Willa=CTO, Tess=Reviewer, Roe=Approver, Piper=CS Lead, Arlo=CMO, Cass=CFO, Juno=CEO(shared). An earlier improvised guess (Roe=cto) was **wrong** and produced a bad Paperclip record (since terminated). **Always read the agentos-config profiles first.**

**Slim FON dev roster (per Chris: leverage config profiles, but minimize + combine reviewer/approver like AGE):**
- **ceo / orchestrator + dispatcher:** Juno (**shared** — escalation slot points to existing AGE Juno id; never a worker)
- **cto / implementer:** **Willa** — authors PRs via **Willa Bot (FON)** App; canonical CTO ("owns the technical work")
- **qa / reviewer + approver (combined):** **Tess** — wired to the Paperclip review stage, posts PASS verdict; **chrisabad PAT** approves+merges (AGE-identical)
- **CS (dedicated role):** Piper — Plain→Piper pipeline (keys stored: `agentos/piper/plain_api_key`, `agentos/juno/plain_api_key`)
- **Defined in config but OUT of the dev gate:** Roe (approver — absorbed into Tess), Arlo (CMO), Cass (CFO)

**Provisioning path = through `agentos-config` (NOT hand-cloning /opt):** Willa/Tess/Piper already have `hermes/profiles/<agent>/` (SOUL.md + config.yaml). Bring-up = (a) make the live runtime profile + `/opt/hermes-wrappers/<agent>.sh` + Paperclip agent record; (b) the LLM-config caveat below.
- **Repo↔live config divergence:** every repo `config.yaml` (incl. Axel's) uses `model.default:"routine"` / `localhost:4000` / `${OPENAI_API_KEY}`, but live profiles (e.g. Axel) run `glm-5.1:cloud` via `ollama.com`. This is a **fleet-wide deploy transform/override**, not FON-specific — replicate the established bring-up step (owned with the Axel/Quinn config bots); do not hand-improvise.

**Blocked on input:**
1. ✅ **Willa Bot (FON) App** — DONE. `Roe Bot (FON)` renamed → `Willa Bot (FON)` (app 3663225, slug `willa-bot-fon`, installed on figma-plugin-font-replacer); creds re-keyed to AWS SM `agentos/willa/github_app`. Implementer/author identity ready.
2. **Plain→Piper CS pipeline** specifics (trigger direction, ticket→issue mapping, reply path, old-machine config).
3. ✅ **agentos-config gitops** — DONE (PR #168). `deploy-hermes-profiles.yml` auto-deploys profile config+instructions to the VPS for live profiles. New-agent bring-up (profile dir + .env + wrapper + pcp key) is still a manual step the job intentionally skips.

When unblocked: finalize Willa/Tess profiles live, create Paperclip records (Willa `cto`, Tess `qa`), add FON entry to `routing-rules.json` (orchestrator=Juno, dispatcher=Juno, implementer=Willa, reviewer=Tess, approver=Tess) → PR → deploy, set the company review→Tess execution-policy gate, then smoke-test in `chrisabad/figma-plugin-font-replacer` (real code issue → Willa PR → Tess PASS → done; phantom blocked).

**Cutover note (2026-06-04):** AGE template fully cut over + validated. Identity model = implementer App authors PRs, chrisabad PAT approves+merges. Gate = GitHub merge + reviewer PASS verdict (Paperclip review stage). CI on ubuntu (agentos-mac decommissioned); plugin/skills/instructions auto-deploy hosted→VPS via tailscale+ssh. **Cascade resolved (plugin v1.52.0, PR #61):** the non-functional orchestrator-deassign sweep (#58/#59) was reverted; the #57 event-driven reassignment guard + 24 tests retained. Reframed root finding: `issue.created/updated` **are** delivered to the plugin via `plugin-event-bus` (gate fires on status changes; execution policy auto-applies on create) — earlier "events not delivered" was wrong. Narrow open item: assignee-only changes don't trigger the #57 guard (deferred; gate holds regardless).

---

## 9. CURRENT MODEL (2026-06-05) — supersedes earlier sections on conflict; use this to stand up PER

This is the validated autonomous model after the AGE-463 (AGE) + FON-2 (FON) end-to-end runs. Where §1–§8 disagree, §9 wins.

### 9a. The flow (no plan-approval gate)
A top-level code issue gets `workMode: planning` auto-set by the plugin. Then, **fully autonomously, no human/board in the loop:**
1. **Implementer plans + decomposes directly.** Writes a short `plan` document, then **creates child issues immediately** (`parentId`, `blockParentUntilDone: true`) — **one PR-sized unit each**. **No `request_confirmation`, no approval step.** (Why: `request_confirmation` is board-gated — `assertBoard` → agents get 403 — so an agent can never resolve it; and a plan-approval gate is redundant. The quality win is the *act* of planning+decomposition.)
2. **Implement each child →** one **App-authored** PR per child → `in_review`.
3. **Review = the only gate.** The reviewer (qa) verifies the PR is **MERGED** (merges it via the approver PAT if sound + CI green) **then** posts PASS → child `done`.
4. **Completeness gate (plugin):** a `workMode:planning` parent **cannot reach `done` until all children are `done`** (`evaluatePlanningCompletion` + `sweepPlanningCompleteness`, plugin ≥v1.63). Grandfathered by a `createdAt` epoch so it never mass-reverts historical issues. Maker ≠ approver throughout.

### 9b. Instruction & identity wiring — the hard-won, easy-to-miss parts
- **SOUL.md is the per-agent instruction file** (Hermes system-prompt slot #1, loaded from the profile). **Put role + operating rules in SOUL.md.** A **profile-level `AGENTS.md` is NEVER loaded** — Hermes loads `AGENTS.md` only as *CWD/project context* (first of `.hermes.md`/`AGENTS.md`/`CLAUDE.md`/`.cursorrules` from the working dir). The shared CWD file `/docker/paperclip-ezk7/data/AGENTS.md` (→ `/paperclip/AGENTS.md`) is injected into **every** agent across **all** companies — keep it **company-agnostic** (shared workflow only; no per-company roster).
- **Implementer App-authorship (per agent):** the agent's wrapper `/opt/hermes-wrappers/<agent>.sh` MUST `export GH_TOKEN="$(bash <profile>/bin/mint-github-token.sh --raw)"` (+ `GITHUB_TOKEN`) before `exec hermes`. Otherwise PRs author as the shared `chrisabad` gh login and the reviewer rejects them. The agent's GitHub App must be **installed on the company's repo with write** — verify with a real write (`POST git/refs` create+delete a ref → `201`), **NOT** `repo.permissions.push` (always `false` for App tokens). Mind the repo's **default branch** (FON's figma repo is `master`, not `main`).
- **Gate config = `routing-rules.json`** company entry: `{implementer, reviewer, approver(=reviewer ok), orchestrator, dispatcher}` + `workflow.reviewRequired: true`. (Plus the plugin A.4 auto-applies the review executionPolicy.)
- **Observability (Langfuse):** the `observability/langfuse` plugin ships **disabled** — it must be in the `enabled:` list in each agent's `config.yaml` (not merely absent from `disabled:`), with creds in `~/.hermes/.env` (= `HERMES_HOME/.hermes/.env`; gateway HOME = juno). Do NOT put the old `/paperclip/langfuse_libs` (v2) on PYTHONPATH — that crashed the fleet (AGE-354). Plugin is v3-compatible + fail-open.
- **Skills:** ensure readable — `chmod -R a+rX /opt/hermes-profiles/*/skills` (default perms were owner-only → `Errno 13` on `skill_view`). Breakdown skill = `paperclip-converting-plans-to-tasks`.

### 9c. PER onboarding checklist (do these)
PER company id `9de6c4a9`, prefix `PER`. **Already in `routing-rules.json` with implementer `3469f1fb` + orchestrator `2cdc9205` but NO reviewer** — that's the gap.
1. **Create/assign a PER reviewer agent** (qa) and add `reviewer` (+ `approver`) to the PER routing-rules entry; set `workflow.reviewRequired: true`. (Maker ≠ approver — reviewer ≠ implementer `3469f1fb`.)
2. **Implementer identity:** confirm PER's implementer has a GitHub App installed-with-write on PER's repo, and its wrapper exports `GH_TOKEN` (9b). Verify via create-ref `201`.
3. **Instructions in SOUL.md** for each PER agent (role + the 9a flow). Do not rely on profile AGENTS.md.
4. **Enable Langfuse** for PER agents (9b) for observability from day one.
5. **Autonomous e2e:** file one multi-part `workMode:planning` issue assigned to the PER implementer; confirm it plans → creates children directly (no `request_confirmation`) → App-authored PRs → reviewer merges → parent `done` only after children done.
6. **Watch window:** `adapter_failed` ~0; no phantom `done`; the completeness gate not mass-firing (it's epoch-grandfathered).

### 9d. Validated
- **AGE:** AGE-463 — plan → 3 children created directly (no confirmation) → App-authored PRs (`app/axel-agentos`) → review. ✅
- **FON:** Willa App-auth fixed (`willa-bot-fon` write to figma repo `master` confirmed); FON-2 multi-part e2e running to validate the same path. Gate wired (routing-rules `029fb83c`, reviewRequired). Piper/CS handled in a separate session.
