# AgentOS Cloud Migration & Local Footprint Reduction
**Spec v1.2 — 2026-05-27 — Author: Otis**

## 1. Goal

Move stateful AgentOS infrastructure off the laptop (currently ~11.6 GB local RAM, ~13 MB free under load). Keep Hermes agents local. Use this window — Weekend is out, topology is simpler — to also:
- Retire services we no longer need
- Reduce ongoing maintenance overhead by adopting managed services
- Start fresh with only the businesses we actively run today

**End state:** ~1.5 GB Hermes agents stay local, everything else cloud-hosted or decommissioned, ~$20/mo cloud spend, only AGE and FON businesses on the new system.

## 2. Strategic Approach: Parallel Build, Then Cutover

The old setup (laptop) stays untouched and running until the new setup (Hostinger) is fully validated. No in-place migration. No risky cutover gymnastics. Build clean, prove it works, then cut over in a brief window and tear down the old.

Rationale:
- Old Paperclip can't reasonably track its own migration (bootstrap deadlock)
- Greenfield forces intentional choices about what to bring forward
- Validation period catches issues before they're production-critical
- Rollback is trivial: keep using the old setup

## 3. Scope

**In scope:**
1. Provision new Paperclip 2026.525.0+ on Hostinger
2. Set up AGE business with minimal active agents
3. Set up FON business with the Plain customer-support pipeline
4. Configure AWS Secrets Manager as Paperclip's secrets backend
5. Configure Hermes credential pools for Ollama Cloud (multi-key, no LiteLLM)
6. Migrate notification service to Hostinger (co-located)
7. Decommission: LiteLLM, Graphiti/Neo4j/Embedding, Infisical
8. Slack plan decision (likely downgrade to free)

**Out of scope (deferred):**
- KAL, PIX, STU, DIA, WEE businesses (none active enough to justify migration slot today)
- Open WebUI (Slack handles both proactive notifications AND conversations adequately)
- Replacing Paperclip with another orchestration platform
- Context layer (Zep / Mem0 / Iris) — defer until there's a real consumer
- Migrating Hermes agents to cloud
- Deep agent re-evaluation (which agents we actually need post-migration)

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
   - Enable Hermes Langfuse plugin
   - Start as a SECOND Hermes process (not replacing the old one yet)
3. Create one test AGE issue, assign to test agent, verify end-to-end
4. Cron routines / scheduled tasks: recreate the ones we still want

**Verification:** All AGE test agents respond to issues on new Paperclip. Langfuse traces flow. Ollama credential pool rotates correctly.

**Rollback:** Disable new-side Hermes agents; old setup keeps running undisturbed.

### Phase 2 — FON business setup
**Risk: LOW. Reversible: HIGH. No disruption. Estimated: 1 day.**

**Prerequisites:** Phase 1 complete. FON agent ownership confirmed.

**Actions:**
1. Create FON company in new Paperclip
2. Create FON agent records + secrets (same pattern as AGE)
3. Repoint Plain webhook → new Paperclip's webhook endpoint
4. Verify Plain customer-support flow end-to-end with a test ticket
5. Recreate FON cron routines

**Verification:** FON agents respond to Plain tickets via new infrastructure. End-to-end SLA targets met.

**Rollback:** Repoint Plain webhook back to old setup.

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

- [ ] Phase 0 complete: Hostinger Paperclip live with AWS Secrets Manager backend
- [ ] Phase 1 complete: AGE agents on new system, end-to-end tested
- [ ] Phase 2 complete: FON agents on new system, Plain webhook flowing
- [ ] Phase 3 complete: Notification service migrated
- [ ] Phase 4 complete: 1 week of stable parallel operation
- [ ] Phase 5 complete: Cutover successful, Chris talking to new-Paperclip Juno via Slack
- [ ] Phase 6 complete: Free RAM > 4 GB sustained for 24h
- [ ] Phase 7 complete: Slack plan decision documented
- [ ] No 401s in any agent logs for 24h post-cutover
- [ ] Langfuse traces flowing for ≥ 3 agents
- [ ] Old infrastructure data archived and verified restorable

## 10. Open Items

1. **FON agent ownership** — who handles Plain webhook today? Needed for Phase 2.
2. **AWS account** — existing or new? Determines IAM setup.
3. **Tailnet topology** — confirm Hostinger box can join Chris's existing Tailnet.
4. **Slack volume estimate** — current message count to inform Phase 7 decision.
5. **Hostinger Paperclip one-click version** — verify it ships 2026.525.0+ before Phase 0.

## 11. Tracking & Change Log

This spec file IS the project tracker until new Paperclip is operational. Each phase's status is updated in-place as work completes. After Phase 0, an umbrella AGE issue is filed in the **new** Paperclip system referencing this file.

### Status

| Phase | Status | Date | Notes |
|---|---|---|---|
| 0 — Provision new Paperclip | Not started | | |
| 1 — AGE setup | Not started | | |
| 2 — FON setup | Not started | | Piper confirmation needed |
| 3 — Notification service migration | Not started | | |
| 4 — Validation (1 week parallel) | Not started | | |
| 5 — Cutover | Not started | | |
| 6 — Decommission old setup | Not started | | |
| 7 — agentos-docs rewrite | Not started | | |
| 8 — Slack plan decision | Not started | | |

### Change Log

- **v1.2.1 (2026-05-27)** — Piper identified as presumed FON owner (verify in Phase 2). Added Phase 7: agentos-docs rewrite (the docs describe deprecated topology and must be updated post-cutover).
- **v1.2 (2026-05-27)** — Greenfield approach: parallel build instead of in-place migration. AGE + FON only. Open WebUI dropped (Slack covers both jobs). Notification service co-located on Hostinger.
- **v1.1 (2026-05-27)** — Hermes credential pools confirmed; LiteLLM elimination clean. AWS Secrets Manager via Paperclip native (requires upgrade to 2026.525+).
- **v1.0 (2026-05-27)** — Initial spec.
