# PER (Personal) company bootstrap — 2026-06-07

Ops-only company (no code/PRs). Built per Chris's direction ("full autonomous ops team", "build now, validate later").
Restructured from the legacy roster (matrix doc had Juno+Reed+Ren+Morgan; Reed=deprecated cross-company dispatcher, Ren=defunct → only Juno+Morgan durable).

## Paperclip
- Company: **Personal**, id `39dc3585-54f1-4543-904e-e95d1fd9395a`, issuePrefix `PER`. Created via POST /companies (board key can create).
- Agents (all hermes_local, glm-5.1:cloud, provider auto, sessionKeyStrategy=issue, wakeOnDemand, per-agent pcp_ key in adapterConfig.env + wrapper):
  - **Juno** `08b68ad1-c11e-4901-87af-32d8338473a1` (ceo) — wrapper juno-per.sh, HERMES_HOME juno-per
  - **Hollis** `2febbb18-7fb5-4c8d-92b5-7d6bd9c1b78b` (cto/ops implementer) — wrapper hollis.sh
  - **Nell** `9c9c5d6c-e629-44e4-a4af-aaf4c23bf743` (qa/reviewer = the gate) — wrapper nell.sh
  - **Morgan** `8031415b-76ed-4cc1-9c92-34e051395402` (cfo, Monarch finance) — wrapper morgan.sh
- All have active membership + tasks:assign grant (auto on create). All 4 keys validated (auth OK).
- Agent API keys minted via **POST /agents/{id}/keys {label}** → returns `token` (pcp_) ONCE. (Juno's first key leaked to transcript on 6/6 — ROTATE if concerned; a 2nd fresh key is the one in use.)

## Execution gate (ops-only — NO plugin change needed)
- companies.default_execution_policy (jsonb) set via psql (DB; mirrors backfill-age pattern). projects table has NO such column in this schema — company-level is what's used.
- PER policy = FON-mirror, single **review** stage by Nell, approvalsNeeded:1, commentRequired:true.
- Why no PR needed: plugin pr-bearing-done-guard (patch 043) only blocks done when there are linked work products of type=pull_request that aren't merged. Ops issues have no PRs → guard is a no-op → Nell's approval advances to done. So verdict IS the gate.

## Hermes profiles (durable: agentos-config PR #190 merged)
- New: hermes/profiles/{juno-per,hollis,nell}/ (config.yaml from clean willa template + role SOULs).
- **Morgan config.yaml FIXED**: had dead localhost:4000 model block (would've failed like FON-2) → glm-5.1:cloud.
- All configs: glm-5.1:cloud/ollama.com/${OLLAMA_API_KEY}, NO langfuse (incident learning).
- SOULs enforce: ops-only (no code), personal-data NEVER in business context, escalate to Chris personal DM (D0AFURXGVTM) only.

## VPS provisioning (runtime — NOT gitops; deploy skips new profiles by design)
- deploy-hermes-profiles only updates ALREADY-LIVE profile dirs ("bringing a new agent live is a separate provisioning step"). So I manually: created /opt/hermes-profiles/{juno-per,hollis,nell,morgan}/ + scp'd config.yaml+SOUL.md, wrote .env (OLLAMA kaleidoscope key ...DeCEz5, HERMES_BUNDLED_PLUGINS, NO langfuse), wrote /opt/hermes-wrappers/{...}.sh (HERMES_HOME, PAPERCLIP key, exec hermes — NO GH_TOKEN since ops). chown paperclip:paperclip. Now that dirs exist, future deploys keep config/SOUL synced.

## VALIDATED 2026-06-07 (Ollama limits reset)
- PER-1 (leaf ops task) e2e PASSED: dispatch→Hollis ran on new profile/wrapper/key/model→produced real 2.6k-char checklist (#4)→in_review→Nell genuine review verdict PASS (#2)→done. Ops gate works (no PR, pr-guard no-op). NOT phantom — real deliverable + real review.
- Fleet post-reset healthy: AGE+FON 0 retries / 0 429 / 0 langfuse, ~30-130 runs/hr baseline (no re-storm — containment held). THREE teams autonomous (AGE+FON+PER).
- Minor waste noted (ROI): one idle Hollis re-run (woke after issue already in_review) + 4 test-comment posts (#5-8, Hollis fumbling comment API — relates to known non-UUID run_id comment friction). Core flow efficient; peripheral noise to watch.

## PENDING (was: e2e — now DONE)
- (historical) E2E smoke-test was BLOCKED on Ollama monthly-max (kaleidoscope extra-usage ceiling reached fleet-wide; raise at ollama.com/settings). Once lifted: validate Juno plan → Hollis ops work → in_review → Nell PASS → done.
- Optional: add backfill-per-default-execution-policy.sh to repo paperclip-patches/ for DB-rebuild reproducibility (AGE/WEE have theirs).
- Update runbook §9c (per-business-onboarding-runbook.md) with actual PER ids/gate.
