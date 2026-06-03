# AgentOS Cloud Migration & Local Footprint Reduction
**Spec v1.3 — 2026-06-03 — Author: Otis**

> **v1.3 reframe (2026-06-03):** The new system is **already live** and **AGE is migrated and running on it** (Phase 0 done, Phase 1 substantially done). This is no longer a "build-in-parallel" plan — it is now an **onboard-additional-businesses-onto-the-live-system** plan. The next businesses are **FON (Font Replacer)** and **PER (Personal)**. Before onboarding them, a set of **reliability learnings from running AGE in production** must be addressed (see §3.5 Per-Business Onboarding Readiness Gate) — otherwise each new business inherits the same phantom-completion and cascade fragility we hit with AGE. KAL/WEE/PIX/STU/DIA remain deferred.

## 1. Goal

Move stateful AgentOS infrastructure off the laptop (currently ~11.6 GB local RAM, ~13 MB free under load). Keep Hermes agents local. Use this window — Weekend is out, topology is simpler — to also:
- Retire services we no longer need
- Reduce ongoing maintenance overhead by adopting managed services
- Start fresh with only the businesses we actively run today

**End state:** ~1.5 GB Hermes agents stay local, everything else cloud-hosted or decommissioned, ~$20/mo cloud spend, **AGE + FON + PER** businesses on the new system.

## 1.5 Current State (2026-06-03)

The new Paperclip stack is **operational on Hostinger** and AGE runs on it today.

| Item | State |
|---|---|
| Hostinger Paperclip (`paperclip-ezk7.srv1710374.hstgr.cloud`) + embedded postgres | **LIVE** (Phase 0 done) |
| AGE company on new system | **LIVE** — 8 agents, 352 issues, executing autonomously |
| AWS Secrets Manager backend | In use (note: some Paperclip `pcp_` keys injected via adapterConfig, not AWS — see memory) |
| Langfuse observability plugin | **DISABLED fleet-wide** — was the sole real crash cause (`adapter_failed`); re-enable blocked on fail-open fix (AGE-354) |
| Execution-policy gate (anti-phantom-completion) | **Working for AGE** (patch 053 + company `default_execution_policy`), verified live |
| FON / PER companies | **Not yet created** |

**Implication:** the heavy lift (provision + AGE migration) is done. Remaining work splits into two tracks: **(A) reliability hardening** (productionizing what we learned running AGE) and **(B) onboarding FON + PER**. Track A gates Track B.

## 2. Strategic Approach: Parallel Build, Then Cutover

The old setup (laptop) stays untouched and running until the new setup (Hostinger) is fully validated. No in-place migration. No risky cutover gymnastics. Build clean, prove it works, then cut over in a brief window and tear down the old.

Rationale:
- Old Paperclip can't reasonably track its own migration (bootstrap deadlock)
- Greenfield forces intentional choices about what to bring forward
- Validation period catches issues before they're production-critical
- Rollback is trivial: keep using the old setup

## 3. Scope

**In scope:**
1. ~~Provision new Paperclip 2026.525.0+ on Hostinger~~ **(DONE)**
2. ~~Set up AGE business with minimal active agents~~ **(DONE — live)**
3. **Reliability hardening (Track A)** — productionize the learnings from running AGE so additional businesses don't inherit its fragility (see §3.5)
4. Set up **FON** business with the Plain customer-support pipeline
5. Set up **PER (Personal)** business *(pipeline/agents TBD — see Open Items)*
6. Configure AWS Secrets Manager as Paperclip's secrets backend *(in use)*
7. Configure Hermes credential pools for Ollama Cloud (multi-key, no LiteLLM)
8. Migrate notification service to Hostinger (co-located)
9. Decommission: LiteLLM, Graphiti/Neo4j/Embedding, Infisical
10. Slack plan decision (likely downgrade to free)

**Out of scope (deferred):**
- KAL, PIX, STU, DIA, WEE businesses (none active enough to justify migration slot today)
- Open WebUI (Slack handles both proactive notifications AND conversations adequately)
- Replacing Paperclip with another orchestration platform
- Context layer (Zep / Mem0 / Iris) — defer until there's a real consumer
- Migrating Hermes agents to cloud
- Deep agent re-evaluation (which agents we actually need post-migration)

## 3.5 Per-Business Onboarding Readiness Gate (learnings from running AGE, 2026-06-03)

Running AGE in production surfaced reliability gaps that are **invisible with one business but multiply with each new one**. These MUST be closed before (or as part of) onboarding FON and PER — otherwise every new company starts phantom-vulnerable and cascade-prone. Full detail in `memory/project_phantom_gate_and_reliability.md`.

**Gate items (block FON/PER onboarding):**

| # | Item | Why it blocks expansion | Status / Ticket |
|---|---|---|---|
| G1 | **Automate per-tenant execution-policy gate provisioning** | New companies get **no** `default_execution_policy` by default → workers self-mark `done` unverified (phantom completion). Today it's a hand-run backfill script per company. Must be part of company creation/deploy, idempotent. | Manual today (`backfill-*-default-execution-policy.sh`); needs automation |
| G2 | **Merge reviewer-rigor + anti-confabulation** | The gate only catches phantoms if reviewers *verify* instead of rubber-stamping, and agents stop fabricating "✅ done" claims. | **PR #162** (AGE-350/351/355) — open, needs merge |
| G3 | **Cascade guardrails** | Recovery dumps a stranded agent's whole queue on the orchestrator (no load cap / domain check) → sprawl + mass phantom completions. Replicates per-tenant orchestrator. | **AGE-352** (keystone) — backlog |
| G4 | **Shared-checkout isolation** | Agents commit feature branches into the shared deploy checkout (`/paperclip/repos/agentos-config`); a restart can then apply patches from a feature branch. More agents × more tenants = more collisions. | **AGE-353** — backlog (manually remediated 2026-06-03) |
| G5 | **Langfuse fail-open** | Observability plugin crashed every model (`adapter_failed`); currently disabled fleet-wide. Re-enabling without fail-open would re-crash a multi-tenant fleet. | **AGE-354** — backlog |
| G6 | **Per-business provisioning runbook** | Repeatable "stand up a new Paperclip business safely" checklist (company → gate → agents → secrets → routines → verify). Does not exist yet. | TODO |

**Worker ≠ approver invariant:** when onboarding agents, never let an issue's assignee (worker) equal its approval-stage agent — that makes the gate a self-rubber-stamp. Bake this into the per-business policy template.

**Recommended sequencing:** close G1–G2 (the phantom-completion floor) and write G6 → **pilot FON** as the first real exercise of the runbook under close watch → fix G3/G4/G5 in parallel → then **PER** → then broader expansion (KAL/WEE/etc.).

## 4. Target Architecture

**Local (laptop):**
- Hermes agents (~1.5 GB) for AGE + FON only — connecting via Tailscale to:
  - Paperclip API (Hostinger)
  - AWS Secrets Manager (via Paperclip)
  - Ollama Cloud direct (credential-pooled, no proxy)
  - Langfuse Cloud direct (Hermes plugin)
  - Slack (proactive notifications + active conversations)

**Cloud:**
- **Hostinger KVM 4** ($14/mo, 4 GB): Paperclip 2026.525+ + embedded postgres + notification service co-located
- **AWS Secrets Manager**: ~10 secrets, ~$5–6/mo
- **Langfuse Cloud**: existing, no change
- **Ollama Cloud**: existing (×2 accounts via Hermes credential pool)

**Decommissioned at cutover:**
- LiteLLM container + DB rows
- Graphiti, Neo4j, Embedding Server containers (Neo4j dump archived)
- Infisical (backend + db + redis) + `bootstrap-secrets.sh`
- Old local Paperclip + its embedded postgres
- Inactive agent profiles (Reed, Hale, WEE agents, KAL agents, etc.)

## 5. Agents to bring forward

### AGE (AgentOS Infrastructure)
| Agent | Role | Decision |
|---|---|---|
| Otis | COO orchestration | bring forward |
| Axel | Code review, fleet ops | bring forward |
| Ellis | PR reviewer for SDLC | bring forward |
| Juno | Daily-driver assistant | bring forward |
| Cass | (recently misconfigured) | re-evaluate before bringing |

### FON (Font Replacer)
| Agent | Role | Decision |
|---|---|---|
| Piper | Plain webhook handler / FON customer support | Bring forward (confirm wiring during Phase 2 — Plain handler currently lives in pending PR #148 / FON-1442, not yet merged into smart-webhook-proxy) |

### PER (Personal)
| Agent | Role | Decision |
|---|---|---|
| *TBD* | *Personal-business agents + pipeline not yet specified* | **Open item** — define PER's agent roster, triggers, and pipeline before Phase 2b |

### Defer/skip
- All WEE agents (Tate, Iris, Joss, WEE Juno)
- All KAL agents
- All PIX agents (pix-reviewer, etc.)
- All STU agents (stu-reviewer, etc.)
- All DIA agents
- Reed (explicitly deprecated, AGE-14111)
- Hale (already offboarded)
- Per-business Juno clones (only AGE Juno needed)
- Utility profiles (hermes-smoke, test-agent, diag) unless actively useful

## 6. Phases

### Phase 0 — Provision new Paperclip stack
**Risk: LOW. Reversible: HIGH. No disruption. Estimated: 0.5 day.**

**Prerequisites:**
- Hostinger account
- AWS account with IAM user for Secrets Manager (`secretsmanager:Get/Put/List/CreateSecret`)
- Tailscale Auth Key for the new box

**Actions:**
1. Provision Hostinger KVM 4 (4 GB RAM)
2. Install Tailscale, join Tailnet
3. Install Paperclip via their one-click (target version 2026.525.0+)
4. Verify Paperclip dashboard accessible via Tailnet IP
5. In Paperclip UI: Company Settings → Secrets → Provider vaults → Add AWS Secrets Manager vault (region of choice, IAM creds via instance role or env)
6. Test secret creation via UI

**Verification:** Hostinger box reachable on Tailnet. Paperclip dashboard loads. AWS Secrets Manager vault registered and shows "healthy."

**Rollback:** Tear down Hostinger box.

### Phase 1 — AGE business setup
**Risk: LOW. Reversible: HIGH. No disruption. Estimated: 1 day.**

**Prerequisites:** Phase 0 complete.

**Actions:**
1. Create AGE company in new Paperclip
2. For each AGE agent (Otis, Axel, Ellis, Juno):
   - Create agent record in new Paperclip
   - Mint per-agent secrets in AWS Secrets Manager (Paperclip API keys, Ollama keys, etc.)
   - Create new Hermes profile pointing at new Paperclip URL
   - Configure Hermes credential pool for Ollama Cloud (×2 accounts, `least_used` strategy)
   - ~~Enable Hermes Langfuse plugin~~ **DEFER — Langfuse plugin currently disabled fleet-wide (crash cause). Do NOT enable until AGE-354 fail-open lands (gate item G5).**
   - Start as a SECOND Hermes process (not replacing the old one yet)
3. Create one test AGE issue, assign to test agent, verify end-to-end
4. Cron routines / scheduled tasks: recreate the ones we still want

**Verification:** All AGE test agents respond to issues on new Paperclip. Langfuse traces flow. Ollama credential pool rotates correctly.

**Rollback:** Disable new-side Hermes agents; old setup keeps running undisturbed.

### Phase 2 — FON + PER business onboarding
**Risk: LOW. Reversible: HIGH. No disruption. Estimated: 1 day per business.**

**Prerequisites:** Phase 1 complete **AND Readiness Gate §3.5 items G1, G2, G6 closed** (gate auto-provisioning + reviewer-rigor merged + runbook written). FON agent ownership confirmed; PER roster/pipeline defined.

**Phase 2a — FON (first runbook exercise, close watch):**
1. Create FON company in new Paperclip → **verify it auto-inherits the execution-policy gate (G1)**; confirm worker≠approver template
2. Create FON agent records + secrets (same pattern as AGE; Langfuse stays off per G5)
3. Repoint Plain webhook → new Paperclip's webhook endpoint
4. Verify Plain customer-support flow end-to-end with a test ticket
5. Recreate FON cron routines
6. **Watch for phantom completions / cascade behavior** — FON is the pilot that proves the runbook + the hardening

**Phase 2b — PER (after FON validates):**
1. Same pattern, once PER's roster/pipeline is defined (Open Item)

**Verification:** FON/PER agents respond via new infra; new companies inherit the gate automatically; no phantom completions; orchestrator does not sprawl. End-to-end SLA targets met.

**Rollback:** Repoint Plain webhook back to old setup; new companies are additive/isolated.

### Phase 3 — Notification service migration
**Risk: LOW. Reversible: HIGH. No disruption. Estimated: 0.5 day.**

**Actions:**
1. Deploy `agentos-services` notification service to Hostinger (Docker or systemd)
2. Migrate notification-tiers.json + any persistent state
3. Point webhook sources (Better Stack, Frame.io, Linear, etc.) at new endpoint
4. Verify notifications are tiered + delivered correctly

**Verification:** A test webhook flows: source → new notification service → Slack DM to Chris.

**Rollback:** Repoint webhooks back to old service on localhost:8012.

### Phase 4 — Validation Period
**Risk: ZERO. Duration: ~1 week. No disruption.**

Run new + old in parallel. Real workload flows through new system. Old system is fallback. Monitor:
- All agents stay online
- Issues are picked up + completed
- Langfuse traces are present + sensible
- Ollama credential pool behaves under load
- No 401s, no auth errors, no schema mismatches
- Plain customer support flow works end-to-end multiple times

**Acceptance:** 1 week of stable operation, no manual intervention needed.

### Phase 5 — Cutover
**Risk: MEDIUM (brief). Reversible: HIGH. Estimated: 30 minutes.**

**Actions:**
1. Announce cutover (just Chris in the loop)
2. Switch Chris's Slack-Juno DM to point at new-Paperclip Juno
3. Switch webhooks for: Plain (already in Phase 2), Linear, Frame.io, Better Stack, etc.
4. Old-side Hermes agents: stop (don't delete yet — fallback)
5. Smoke test: send Juno a message, file a test issue, verify webhook flow

**Verification:** Slack DM to Juno responds from new infrastructure. Webhook events arrive at new system. All AGE + FON workflows working.

**Rollback:** Restart old-side Hermes agents, repoint Slack DM + webhooks back. Memory pressure returns but fleet works.

### Phase 6 — Decommission old setup
**Risk: LOW. Reversible: MEDIUM (data archived). Estimated: 1 hour.**

**Prerequisites:** Phase 5 stable for at least 48 hours.

**Actions:**
1. `pg_dump` old Paperclip postgres → archive
2. `docker exec openclaw-neo4j neo4j-admin database dump` → archive
3. `docker stop`: graphiti, neo4j, embedding-server, litellm-proxy, infisical-*
4. `launchctl unload` all old `ai.hermes.gateway-*` (AGE + FON agents) plists
5. Stop old `com.paperclipai.server`
6. Remove `bootstrap-secrets.sh` from active launch path
7. Verify ~9 GB local RAM freed (free RAM > 4 GB sustained)

**Verification:** vm_stat shows healthy free pages. No agent activity references old endpoints.

**Rollback:** Restart all stopped services. Data archived so nothing is permanently lost.

### Phase 7 — agentos-docs rewrite
**Risk: LOW. Reversible: HIGH (git). Estimated: 1-2 days.**

The `agentos-docs` repo (Mintlify-style site, includes architecture/, getting-started/, infrastructure/, operations/, paperclip/, workforce/) currently describes the *old* topology — LiteLLM, Infisical, Graphiti pipeline, embedded local Paperclip, bootstrap-secrets.sh, multi-business agent fleet. After cutover, these docs are wrong-and-load-bearing — future agents will read them as authoritative and try to use deprecated paths.

**Prerequisites:** Phases 0–6 complete (so we're documenting actual state, not aspirational state).

**Actions:**
1. Audit `/Users/openclaw/repos/agentos-docs/` — inventory of pages that reference decommissioned services
2. Rewrite sections:
   - **architecture/** — new topology diagram (Hostinger Paperclip + AWS Secrets + Hermes direct-to-Ollama)
   - **infrastructure/** — remove LiteLLM, Infisical, Graphiti pipeline pages. Replace with AWS Secrets Manager + Hermes credential pools + Langfuse plugin pages
   - **getting-started/** — fresh agent onboarding flow targeting the new system (no more bootstrap-secrets, secrets via AWS UI in Paperclip)
   - **operations/** — runbooks for: new Paperclip restart, secret rotation in AWS, Hermes credential pool tuning, notification service ops
   - **paperclip/** — point at 2026.525+ features, AWS Secrets Manager integration
   - **workforce/** — current AGE + FON agent roster; mark deferred businesses
3. Verify Mintlify build (`docs.json` config) renders cleanly
4. Open PR through proper SDLC (Ellis review on new system)

**Verification:** Docs site builds and deploys. Spot-check key pages match actual deployed reality. No references to decommissioned services in the active docs.

**Rollback:** Standard git revert.

### Phase 8 — Slack plan decision
**Risk: ZERO. Estimated: 5 minutes.**

Evaluate after at least 1 week on new setup:
- Message volume in Slack — does free plan's 10K limit accommodate?
- 90-day history loss — acceptable?

**Decision: keep paid or downgrade to free.** Default toward downgrade if usage allows.

## 7. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Hostinger one-click doesn't ship 2026.525+ | Medium | Phase 0 stalls | Manual install fallback; we know the npm package |
| AWS Secrets Manager IAM setup blocks Phase 0 | Low | Phase 0 delay | Have AWS creds ready before starting |
| FON ownership unclear → Phase 2 stuck | Medium | Phase 2 delay | Resolve before locking spec |
| Credential pool exhausts both Ollama accounts simultaneously | Low | Brief LLM outage | Both accounts have different reset windows; very unlikely to both exhaust at once |
| Tailnet routing flaky | Low | Agents can't reach new Paperclip | Test thoroughly before Phase 5 |
| Webhook sources don't support TLS to Tailscale endpoints | Low | Webhook delivery fails | Cloudflare Tunnel as fallback for HTTPS exposure |
| Forgotten agent / routine on old setup keeps doing useful work | Medium | Lost capability | Inventory active routines before Phase 6 |
| Memory pressure persists during 1-week validation period | High but not new | Status quo continues | Acceptable — old setup is what we have today |

## 8. Cost Summary

| Service | Current | New | Monthly Delta |
|---|---|---|---|
| LiteLLM container + DB | $0 (local, 2 GB) | $0 (eliminated) | $0 |
| Graphiti + Neo4j + Embedding | $0 (local, 1.5 GB) | $0 (decommissioned) | $0 |
| Infisical (3 containers) | $0 (local, 700 MB) | $0 (replaced by AWS) | $0 |
| AWS Secrets Manager | n/a | ~$5–6 | +$5–6 |
| Paperclip + postgres + notification svc | $0 (local, ~5.5 GB) | $14 (Hostinger KVM 4) | +$14 |
| Slack | $X (paid) | $0 or $X (Phase 7 decision) | -$X or 0 |
| **Total cloud** | **$0** | **~$19–20** | **+$19–20** |
| **Total local RAM freed (post-Phase 6)** | | | **~9 GB** |

## 9. Acceptance Criteria

- [x] Phase 0 complete: Hostinger Paperclip live with AWS Secrets Manager backend
- [x] Phase 1 complete: AGE agents on new system, executing autonomously *(end-to-end validated in production)*
- [ ] **Readiness Gate §3.5 closed (G1–G6)** — gate auto-provisioning, PR #162 merged, AGE-352/353/354, runbook
- [ ] Phase 2a complete: FON agents on new system, Plain webhook flowing, **gate auto-inherited, no phantom completions**
- [ ] Phase 2b complete: PER onboarded (roster/pipeline defined first)
- [ ] Phase 3 complete: Notification service migrated
- [ ] Phase 4 complete: 1 week of stable parallel operation
- [ ] Phase 5 complete: Cutover successful, Chris talking to new-Paperclip Juno via Slack
- [ ] Phase 6 complete: Free RAM > 4 GB sustained for 24h
- [ ] Phase 7 complete: Slack plan decision documented
- [ ] **Zero `adapter_failed`** across the fleet for 24h *(replaces the disproven "no 401s" criterion — there is no auth/401 bug; the real failure mode was the Langfuse crash)*
- [ ] **No phantom completions** and **no orchestrator cascade sprawl** during a multi-business validation window
- [ ] Langfuse traces flowing for ≥ 3 agents *(blocked on AGE-354 fail-open; deferred — not a cutover blocker)*
- [ ] Old infrastructure data archived and verified restorable

## 10. Open Items

1. **PER (Personal) definition** — agent roster, triggers, and pipeline are unspecified. Needed before Phase 2b.
2. **FON agent ownership / Piper wiring** — confirm Plain handler (PR #148 / FON-1442) before Phase 2a.
3. **Gate auto-provisioning (G1)** — decide implementation: hook the backfill into company-creation, or a deploy-time `ensure` over all companies. Today it's manual per company.
4. **Per-business runbook (G6)** — author it; FON is the first real exercise.
5. **Slack volume estimate** — current message count to inform Phase 8 decision.
6. ~~AWS account~~ / ~~Tailnet topology~~ / ~~Hostinger one-click version~~ — **resolved** (Phase 0 complete on the live box).

## 11. Tracking & Change Log

This spec file IS the project tracker until new Paperclip is operational. Each phase's status is updated in-place as work completes. After Phase 0, an umbrella AGE issue is filed in the **new** Paperclip system referencing this file.

### Status

| Phase | Status | Date | Notes |
|---|---|---|---|
| 0 — Provision new Paperclip | **DONE** | ~2026-06 | Hostinger `paperclip-ezk7`, embedded postgres, AWS SM backend |
| 1 — AGE setup | **DONE (live)** | 2026-06 | 8 agents, 352 issues, executing autonomously |
| **3.5 — Reliability Readiness Gate (G1–G6)** | **In progress** | 2026-06-03 | Gates Phase 2. PR #162 open; AGE-352/353/354 backlog; gate auto-provisioning + runbook TODO |
| 2a — FON onboarding | Not started | | Blocked on G1/G2/G6; Piper confirmation needed |
| 2b — PER onboarding | Not started | | Blocked on PER roster/pipeline definition |
| 3 — Notification service migration | Not started | | |
| 4 — Validation (1 week parallel) | Not started | | |
| 5 — Cutover | Not started | | |
| 6 — Decommission old setup | Not started | | |
| 7 — agentos-docs rewrite | Partially done | 2026-06 | docker/overview/infrastructure docs already corrected to current topology |
| 8 — Slack plan decision | Not started | | |

### Change Log

- **v1.3 (2026-06-03)** — Reframe: new system live, AGE migrated; plan is now onboard-onto-live, not build-in-parallel. Added **PER** as a target business alongside FON. Added **§1.5 Current State** and **§3.5 Per-Business Onboarding Readiness Gate** capturing production learnings from running AGE (execution-policy gate / phantom completion, reviewer-rigor PR #162, cascade AGE-352, shared-checkout AGE-353, Langfuse disable AGE-354, worker≠approver invariant, per-business runbook). Corrected stale items: Langfuse plugin now DEFERRED (was "enable"), acceptance criterion "no 401s" replaced with "zero adapter_failed + no phantom completions" (the 401 theory was disproven confabulation). Phase 2 split into 2a (FON pilot) / 2b (PER).
- **v1.2.1 (2026-05-27)** — Piper identified as presumed FON owner (verify in Phase 2). Added Phase 7: agentos-docs rewrite (the docs describe deprecated topology and must be updated post-cutover).
- **v1.2 (2026-05-27)** — Greenfield approach: parallel build instead of in-place migration. AGE + FON only. Open WebUI dropped (Slack covers both jobs). Notification service co-located on Hostinger.
- **v1.1 (2026-05-27)** — Hermes credential pools confirmed; LiteLLM elimination clean. AWS Secrets Manager via Paperclip native (requires upgrade to 2026.525+).
- **v1.0 (2026-05-27)** — Initial spec.
