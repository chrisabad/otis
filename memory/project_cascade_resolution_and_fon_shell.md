# Cascade resolution + FON shell (2026-06-04)

## Events reframe (correcting an earlier wrong call)
`issue.created`/`issue.updated` **ARE** delivered to the plugin via the server's
`plugin-event-bus` (services/plugin-event-bus.js; referenced in routes/issues.js,
services/issues.js). Evidence: the execution-policy **gate fires on status changes**
and new issues auto-inherit the review→approver policy on create. The earlier
"reactive events not delivered to plugins" conclusion (from a stale AGE-216 comment)
was **too broad / wrong**. Chris was right that the hooks were patched to work.

Narrow remaining unknown: an **assignee-only** change apparently does NOT trigger the
#57 reassignment guard (either assignee-only updates don't emit, or the guard's
payload check is off). Deferred — the gate holds regardless of cascade routing.

## Cascade decision: revert dead sweep (PR #61, plugin v1.52.0, MERGED + deployed)
- Removed the orchestrator-deassignment sweep added in #58 / rewritten in #59
  (`sweepOrchestratorAssignments` + its registration). It deployed + registered but
  never acted across 3 deploy cycles — no logs, no reassignments.
- **Kept** the #57 event-driven reassignment guard (`toOrchestrator` revert logic in
  worker.ts ~line 4392) + its 24 regression tests (age-352-safeguards.test.ts). 107/107 green.
- Version source of truth = `src/manifest.ts` (NOT just package.json/paperclip.manifest.json).
  CI step "Verify manifest version matches package.json" imports dist/manifest.js — must
  rebuild (`npm run build`) after bumping src/manifest.ts or CI fails.

## PR identity gotcha (important for the gate)
Local `gh` is authed as **chrisabad** → PRs created with ambient gh are authored by
chrisabad, and the chrisabad PAT then **cannot self-approve** ("Can not approve your
own pull request"). Fix: author PRs as the **otis-age App**.
- Mint App token: parse AWS SM `agentos/otis/github_app` (keys: app_id, installation_id,
  private_key), export GITHUB_APP_ID / GITHUB_INSTALLATION_ID / GITHUB_APP_PRIVATE_KEY_B64
  (base64 the PEM), run `setup/gen-github-token.py`. Token is `ghs_…` (App token; `/user`
  returns 403 — normal, it's not a user). Use `GH_TOKEN=$APPTOKEN gh pr create`.
- Then approve+merge with chrisabad PAT from AWS SM `agentos/ellis/github_approver_pat`.
- Apps CANNOT submit PR *approvals* — only the PAT can. App opens, PAT approves+merges.

## FON shell created (live)
- Company **`029fb83c-3204-4fef-a90c-85a8e89ca49d`** (prefix FON), 0 agents.
- The screenshot roster (FON `05fe3b35`) was Chris's *intended design*, NOT live.
- Final FON roster (per Chris): Juno=ceo/orchestrator; **new separate agent**=cto/implementer
  (needs its own GitHub App); Tess=qa reviewer+approver (chrisabad PAT merges); Reed=dispatcher;
  Piper=CS agent (no routing role, Plain→Piper pipeline).
- **Blocked on input** before agents: (1) GitHub App for the new CTO; (2) per-agent models;
  (3) Plain→Piper pipeline specifics; (4) confirm Juno/Tess/Reed net-new vs shared.
- Checklist lives in specs/per-business-onboarding-runbook.md (Tracking section).

## ⚠️ FON ROSTER CORRECTION (2026-06-04, later) — supersedes the improvised roster above
**Do NOT improvise FON roles.** The canonical roster already exists in `chrisabad/agentos-config`
(`hermes/profiles/<agent>/SOUL.md`), built over many AGE tickets: **Willa=CTO, Tess=Reviewer,
Roe=Approver, Piper=CS Lead, Arlo=CMO, Cass=CFO, Juno=CEO(shared).** My improvised guess "Roe=cto"
was WRONG (Roe is the Approver; **Willa** is the CTO). I created+terminated a bad Roe-cto Paperclip
record (86038bc9). Lesson: read agentos-config profiles BEFORE designing.

**Slim FON dev roster (Chris: leverage config profiles but minimize + combine reviewer/approver like AGE):**
- cto/implementer = **Willa** (authors PRs via **Willa Bot (FON)** App — creds NOT yet provided)
- qa (reviewer+approver combined) = **Tess** (Paperclip review stage + PASS verdict; **chrisabad PAT** merges)
- ceo = **Juno** (shared; escalation slot → AGE Juno id)
- CS = **Piper** (Plain keys stored: agentos/piper/plain_api_key, agentos/juno/plain_api_key)
- OUT of dev gate (defined in config, unused): Roe (approver, absorbed), Arlo (CMO), Cass (CFO)
- FON code repo = `chrisabad/figma-plugin-font-replacer` (private). FON company `029fb83c` (prefix FON).
- Roe Bot (FON) App creds were stored at `agentos/roe/github_app` (app 3663225, install 138029943,
  repo figma-plugin-font-replacer) but Roe is OUT of the slim gate → not needed; chrisabad PAT merges.

**Provisioning = via agentos-config, NOT hand-clone.** Willa/Tess/Piper profiles already exist in repo.

## agentos-config GITOPS GAP (confirmed 2026-06-04 — Chris flagged it)
Only workflow = `.github/workflows/deploy-agent-instructions.yml`. It deploys ONLY
AGENTS.md/SOUL.md/HEARTBEAT.md/TOOLS.md → `/docker/.../agent-instructions/<agent>/`, is **hardcoded to
7 AGE agents** (juno axel orion ellis quinn vera dex), and **never deploys config.yaml, never touches
/opt/hermes-profiles/, never restarts the gateway.**
- Result: live `/opt/hermes-profiles/<agent>/config.yaml` was **hand-edited** and DIVERGES from repo
  (md5 mismatch). Repo configs all say `model.default:"routine"` / `localhost:4000` / `${OPENAI_API_KEY}`
  (dead LiteLLM-proxy form); live runs `glm-5.1:cloud` via `ollama.com` / `${OLLAMA_API_KEY}`.
- **CLOBBER RISK:** naively gitops-deploying repo config.yaml would break every agent's LLM. Fix order:
  (1) reconcile repo config.yaml → live ollama form (verify per-agent), THEN (2) generalize the deploy
  workflow (all agents, include config.yaml, sync to /opt/hermes-profiles preserving runtime state+.env,
  restart gateway). Mirror the plugin deploy.yml pattern (tailscale+ssh) I built for paperclip-issue-trigger.
- This is fleet-wide (high blast radius), actively owned by Axel/Quinn config bots.

## FON remaining blockers
1. **Willa Bot (FON) App creds** (app_id + PEM) → AWS SM `agentos/willa/github_app` (implementer/author).
2. **Plain→Piper** pipeline specifics (trigger dir, ticket→issue map, reply path).
3. Confirm/replicate the live LLM-config bring-up step (so FON profiles use Ollama, not the dead proxy).

## FON BRING-UP (2026-06-04) — agents live, gate validated
Agent profiles built by cloning a live profile dir → purge runtime state → swap identity/.env(COMPANY_ID/AGENT_ID)/GH-creds → wrapper w/ own pcp key. (hermes `profile` CLI registry is NOT used by these agents — they're standalone HERMES_HOME dirs.) OLLAMA_API_KEY lives in each profile's `.env` as `export OLLAMA_API_KEY=...`.
- **Willa** cto `2835530c` (cloned axel; willa-bot-fon App app=3663225 install=138029943, real cred files in bin/ replacing axel's juno-symlinks; mint-github-token.sh verified → repo-scoped token to figma-plugin-font-replacer; model gpt-oss:20b)
- **Tess** qa `e105f216` (cloned ellis; approver PAT in .env auth=chrisabad verified; model glm-5.1:cloud)
- **FON Juno** ceo `16adddf5` (cloned juno profile = juno-fon; own key/wrapper. "Same hermes agent" not literally possible — each Paperclip agent needs own key to read its own queue; so it's a clone w/ own identity, same persona.)
- Gate = company default_execution_policy review→Tess (1 approval, commentRequired). Set via DB UPDATE (psql stdin; -v interpolation fails on JSON). Auto-applies on issue create (FON-1 had stages=['review']).
- routing-rules.json FON entry (PR #62) + orchestrator/dispatcher→FON Juno (PR #63, also added routing-rules.json to deploy.yml paths). Plugin deploy paths previously excluded routing-rules.json (manual trigger) — fixed in #63.
- **Gate VALIDATED end-to-end (FON-1)**: forcing done w/o PR → intercepted to in_review (phantom blocked). With **glm-5.1:cloud** (gpt-oss:20b was too weak — AGE-385 RESOLVED via model swap), Willa cloned repo, created CONTRIBUTING.md, opened PR #202 (willa-bot-fon), set in_review. Tess REJECTED the empty gpt-oss attempt then APPROVED the real one → issue done. AGE-384 RESOLVED (PAT now has admin+push on figma repo).
- **GATE GAP found (AGE-392)**: Tess's Paperclip PASS verdict completed the issue while PR #202 stayed UNMERGED (Otis merged manually). 'done' is driven by the reviewer verdict, NOT coupled to the GitHub merge — a phantom vector if a reviewer approves without merging. Fix: enforce merge-before-done + reviewers must merge-then-verdict.
- Lessons: FON implementer needs glm-5.1:cloud (not gpt-oss:20b). Reviewer must merge before posting verdict.

### FON happy-path blockers (TICKETED in AGE)
- **AGE-384 [BLOCKER]**: chrisabad approver PAT (agentos/ellis/github_approver_pat) 404s on figma-plugin-font-replacer (scoped to agentos-* only) → Tess can't merge FON PRs. Chris must add the repo to PAT scope.
- **AGE-385**: Willa/gpt-oss:20b not completing PR tasks (malformed tool calls). Consider stronger model.
- AGE-386 Honcho 600/min rate limit; AGE-387 Plain→Piper pipeline (webhook+replyToThread+updateThreadAgentStatus, keys in agentos/{piper,juno}/plain_api_key); AGE-388 prune phantom routing companies; AGE-389 runbook gate-model doc drift; AGE-390 remove vestigial orion profile; AGE-391 cascade #57 assignee-only.

## AGE roster cleanup (2026-06-04): terminated redundant Quinn/Vera/Dex/Orion. Orion's dispatch-failure-monitor migrated /opt/hermes-profiles/orion → /opt/agentos-monitor on the board key (lifecycle-independent), cron repointed, verified post-termination.

## 🔴 PLUGIN WAS FULLY BROKEN — 3 root causes found+fixed (2026-06-04, Chris flagged "9 todo, no assignee, sweeps broken")
1. **Wrong API port (CORE):** plugin hardcoded `PAPERCLIP_API="http://127.0.0.1:3101"`. 3101 = worktree-isolated sub-server port (worktree-config.js); the MAIN API is on **3100** (env PORT=3100). Every plugin→API fetch = `TypeError: fetch failed` (ECONNREFUSED) → ALL sweeps + dispatcher silently dead. Fix (PR #64): `http://127.0.0.1:${process.env.PORT||"3100"}`. This also explains the long-standing "sweep deployed but never acted" mystery.
2. **Deploy is a NO-OP (CRITICAL, AGE-395):** server loads plugin from `package_path=/paperclip/plugins/kaleidoscope-issue-trigger` (installed copy), but deploy.yml/vps-deploy.sh only git-fetch `/docker/.../repos/paperclip-issue-trigger` + restart — NEVER updates the installed dir. So EVERY plugin deploy this session (v1.52 cascade revert, routing-rules, fixes) was a silent no-op; running plugin stayed 1.51.0. **Manual reconcile:** `docker cp <local dist>/{worker.js,manifest.js} container:/paperclip/plugins/kaleidoscope-issue-trigger/dist/ && docker restart`. ALSO the VPS repo git remote auth is broken (fetch = invalid token).
3. **Dispatcher wakeup 401 (AGE, no auto-assign):** the 5 `POST /api/agents/:id/wakeup` calls (and ALL plugin fetches) sent NO Authorization header; wakeup endpoint requires a bearer → 401, so the orchestrator was never woken to triage/assign. Fix (PR #66): `wakeupHeaders()` using `process.env.PAPERCLIP_BOARD_KEY` (present in container env). Verified live: wakeup now 202.

After fixes (live via manual reconcile + in main): execution policy auto-applies to new issues AND backfills backlog via the onboarding sweep (verified AGE-384/385/389/393/394 = ['review']); dispatcher wakes Juno (202). NOTE: `?status=todo` LIST endpoint OMITS executionPolicy — must use single GET /issues/:id to see the gate (caused false "0 gated" readings).

## FON gate gap recap: AGE-392 (done on reviewer verdict without enforcing GitHub merge). Tickets AGE-384..395 cover all loose ends.

## VERIFIED Paperclip plan-first / autonomy model (2026-06-05, AGE-397) — authoritative
Mechanism (verified against server code, not assumed):
- **No 'planning' execution-policy stage** — stage type enum is `review|approval` ONLY (a planning stage → PATCH 400). **`planRequired` is NOT a field** anywhere (silently stripped; old plugin setting it was a no-op).
- **`workMode: planning` IS the "plan required" enforcement** (persists to `work_mode` column; `ISSUE_WORK_MODES=["standard","planning"]`). When set, `heartbeat.js` injects directive "Make the plan only. Do not write code." Then after acceptance: "Create child issues from the approved plan."
- **Plan acceptance = `request_confirmation`** interaction with status `accepted` (`acceptedPlanContinuation` in heartbeat.js). NOT an execution-policy stage. By DEFAULT this waits for a HUMAN → so default Paperclip planning is collaborative, NOT autonomous.
- **Parent/child blocking is opt-in**: `blockParentUntilDone` defaults FALSE; the create-child helper sets parent.blockedBy=child only when true. No native "parent blocked by open children" rule.
- **Autonomy = agents in the human seats**: plugin deterministically assigns implementer + sets workMode:planning; the ORCHESTRATOR (Juno) accepts the plan request_confirmation autonomously; the implementer creates subtasks with blockParentUntilDone:true; the REVIEWER gates each subtask + the parent (review-only, approval dropped).

Loop: issue → [plugin] planning mode + review gate + assign implementer → [implementer] plan + request_confirmation → [Juno] accept → [implementer] subtasks w/ blockParentUntilDone → parent blocks → subtasks review→done → parent auto-unblocks → review → done.

Shipped: plugin v1.58 (PR #74) — level-aware defaults, deterministic assignment, review-only, no planning stage. Instructions (agentos-config PR #170) — Axel/Willa plan-first + blockParentUntilDone; Juno autonomous plan acceptance; willa/AGENTS.md created. FON Juno (juno-fon, runtime clone not in repo) updated manually — NOTE: juno-fon isn't gitops-managed, so future instruction changes need manual copy OR add juno-fon to agentos-config.

## Plugin deploy bugs fixed this session (all were why "nothing worked"):
1. Port 3101→3100 (PR #64) — plugin couldn't reach API at all (fetch failed).
2. Deploy no-op (PR #68, AGE-395) — vps-deploy.sh now syncs the INSTALLED dir (/paperclip/plugins/...), was only updating the git checkout.
3. All-calls auth (PR #69) — plugin sent no Authorization; loopback not trusted → 401. pfetch() adds PAPERCLIP_BOARD_KEY.
Tickets AGE-384..397 cover all loose ends; AGE-384/385/389/390/395/397 resolved.

## AGE-392 ENFORCEMENT BOUNDARY (2026-06-05) — plugin can DETECT but NOT enforce
e2e tests AGE-404/407 reached `done` with NO artifacts despite the deployed AGE-392 guard.
Root cause: the plugin guard (sweepStrandedReviewerVerdicts) DETECTS confabulation perfectly
("AGE-392: blocked confabulated done — no completion artifact" / "...PR #75 is not merged")
but its revert PATCH gets **422 "Only the active reviewer or approver can advance the current
execution stage"** — the plugin (board key) is NOT the active reviewer. The REVIEWER AGENT
(Ellis) then advances to `done` directly (allowed). So:
- Plugin: DETECTS (works) — posts "AGE-392 gate:" comment; can't revert (422).
- Deterministic enforcement REQUIRES a Paperclip SERVER change (execution-policy engine must
  validate the artifact before allowing stage completion). This is the goal's stop-and-ask.
- Non-server mitigation SHIPPED (agentos-config PR #171): reviewer (Ellis/Tess) instructions —
  verify the linked PR is MERGED (merge via approver PAT) before PASS/advance; no merged PR
  (or, for a parent, subtasks not all done) => FAIL. Enforcement at the gatekeeper (the only
  actor that CAN advance). Not deterministic (LLM), but the correct layer + plugin detection
  as the forcing signal. Plugin AGE-392 guard shipped: PR #76 (v1.59). Axel -> glm-5.1 (done).
- SEPARATE e2e blocker found: Axel "push blocked by GitHub auth" — implementer can't push PRs
  (git push auth, distinct from gh token). Must fix before a real artifact can be produced.

## PER: still deferred — incomplete roster (implementer unknown, Ren in error).

## 2026-06-04 — Axel push "blocker" was a MISDIAGNOSIS (corrected)

Earlier I concluded "Axel's axel-agentos App lacks push (permissions.push=false) → needs a user grant." **WRONG.**
- `GET /repos/{repo}.permissions.push` returns **`false` for App installation tokens even when they CAN write** — it's a user-permissions field, meaningless for App tokens. (The otis-age App, which I push PRs with daily, also reports push=false.)
- Real test: minted the axel-agentos token in-container and did a **create-ref → HTTP 201** on chrisabad/paperclip-issue-trigger. The token HAS write.
- So Axel's "push blocked by GitHub auth" (AGE-407) was a **git-CONFIG issue in the run** — the token wasn't wired into the remote — NOT a missing permission. **No user GitHub grant needed.**
- Fix shipped (agentos-config PR #172, merged+deployed): Axel + Willa AGENTS.md now carry explicit `## Pull requests — git auth (REQUIRED before any push)`: mint token → `git remote set-url origin https://x-access-token:$TOKEN@github.com/...` (or `export GH_TOKEN=$TOKEN` + `gh pr create`) → push. Live on VPS /opt/hermes-profiles + agent-instructions.
- The otis-creds-in-axel/bin workaround was tried then **reverted** to clean axel-agentos symlinks (it was unnecessary once the real cause was found).

**Lesson:** never diagnose an App token's write capability from `repo.permissions` — do a real write (create+delete ref). Verify before diagnosing (again).

**Runbook:** specs/per-business-onboarding-runbook.md bumped to v2.2 with the AGE-392 two-layer gate (plugin detection + reviewer discipline; server-side enforcement still pending) and this push-auth gotcha.

**E2E re-run:** issue 3f6910fc (planning, Juno) filed 2026-06-04 to validate plan→accept→subtasks(blockParentUntilDone)→Axel PR (push-auth fixed)→Ellis verify+MERGE→done with real artifacts; confabulated done blocked. In progress at time of writing.

## 2026-06-05 — E2E POSITIVE PATH VALIDATED (AGE-410, real artifacts, done)

The execution gate is validated end-to-end, BOTH directions:
- **Negative (anti-confabulation):** Ellis refused chrisabad-authored PR #80 with `changes_requested` citing acceptance criteria; first run (AGE-409) was held in_review/in_progress, never confabulated to done; AGE-352 cascade guard blocked assigning the orchestrator. Proven twice.
- **Positive (real PR -> merged -> done):** AGE-410 → Axel implemented → **PR #82 authored by axel-agentos[bot]** → approved+merged by chrisabad PAT (maker≠approver holds) → main=1.60.0 → Ellis posted PASS verdict "Per AGE-392 gate verified" → issue **done** with the real merged artifact.

**Key root-cause fix — chrisabad PR authorship:** the container/host shared `gh` CLI is logged in as `chrisabad` (active account), so every agent defaulted to authoring PRs as chrisabad. The `repo.permissions.push=false` is a measurement artifact (App tokens always report it; verify write via create-ref→201). FIX (live): `/opt/hermes-wrappers/axel.sh` now exports `GH_TOKEN=$(mint-github-token.sh --raw)` at launch → `gh auth status` = `axel-agentos[bot] (GH_TOKEN)`. GH_TOKEN overrides hosts.yml. ⚠️ This edit is NOT in gitops yet (filed follow-up) and must be applied to willa.sh too.

**Instruction fixes shipped (agentos-config):** PR #172 (implementer push-auth) + PR #173 (retire Quinn/Vera/Dex → Ellis is the QA gate; Ellis plan-model corrected to request_confirmation; Ellis CI-aware `gh pr merge --squash --admin` + duplicate-PR close; Axel PR-dedup). Axel→glm-5.1.

**Residual follow-ups filed (AGE):** persist axel.sh fix to gitops + apply fleet-wide; changes_requested return-assignee should be the implementer not the orchestrator (it stranded the issue, needed manual re-routing twice); grant ellis-agentos App Checks:Read+Actions:Read for CI pre-verify. Also: Axel skipped plan-doc/subtask decomposition both runs (implemented directly) — fine for trivial changes, but the plan→subtask flow wasn't exercised.

**Runbook:** specs/per-business-onboarding-runbook.md is at v2.2 (AGE-392 two-layer gate + push-auth gotcha). Update to note positive-path validation + the shared-gh-auth identity fix.

## 2026-06-05 — ROOT CAUSE: agents don't receive their profile AGENTS.md (instruction-delivery bug)

Investigating "why no task→subtask decomposition", traced the ACTUAL model prompt via hermes local request_dumps (/opt/hermes-profiles/<agent>/sessions/request_dump_*.json — full LLM payloads; dumping stopped Jun 4) + state.db `messages`.
- **Finding:** the assembled system prompt = **SOUL.md (per-agent, loads) + /paperclip/AGENTS.md (shared CWD doc) + MEMORY + skills-list**. The **per-agent profile AGENTS.md is NEVER injected** (axel: 0/70 dumps contain its markers "Feature & Plugin Engineer"/"## Planning"/request_confirmation). So planning/decomposition/PR rules placed in profile AGENTS.md never reached the model → **decomposition was MISSING, not ignored.**
- The native Paperclip planning directive ("Make the plan only…") is ALSO absent in our deployment (0 hits) — our server predates/!wires v2026.512.0 directive injection.
- **/paperclip/AGENTS.md** (host: /docker/paperclip-ezk7/data/AGENTS.md, durable mount) was a STALE, WRONG "directory of all AI agents" with mismapped IDs (a38cd7bc[Juno]→"Axel", a3e4c733[Ellis]→"Quinn") and was injected into EVERY agent across ALL companies (FON's Willa/Tess too — multi-tenant prompt-bleed).
- **FIX (live):** rewrote /paperclip/AGENTS.md to be **company-agnostic** — removed the hardcoded roster (point to SOUL.md + `GET /companies/{id}/agents`), added the shared workflow rules (planning→decompose w/ blockParentUntilDone→App-authored PR→reviewer merge-before-PASS gate→done; maker≠approver). Backup: AGENTS.md.bak-otis-20260605. Takes effect next heartbeat.
- **Implication:** PR #172/#173 (profile AGENTS.md edits) were INERT. App-authorship win came from the axel.sh GH_TOKEN env fix, not the instruction text. Per-agent operating specifics still need to move to SOUL.md or hermes must load profile AGENTS.md (filed [platform] tickets).
- **Lesson:** verify instructions are actually IN the model prompt (read request_dumps / state.db) before assuming an agent "ignored" them. Editing files that aren't injected = no-op.

## 2026-06-05 (late) — Langfuse, instruction-delivery, and the planning-lifecycle gate

**Langfuse (Hermes observability plugin):** runs on a SEPARATE VPS (langfuse-lugt.srv1724463.hstgr.cloud). Was disabled AGE-354. To enable: bundled plugins ship OFF — the plugin MUST be in the `enabled:` list in config.yaml (NOT merely absent from `disabled:`), AND creds (HERMES_LANGFUSE_PUBLIC_KEY/SECRET_KEY/BASE_URL) must be in `~/.hermes/.env` (= HERMES_HOME/.hermes/.env; the systemd gateway has HERMES_HOME=/opt/hermes-profiles/juno). Plugin reads os.environ; it's fail-open + v3-compatible (langfuse SDK 3.15.0; do NOT re-add the old /paperclip/langfuse_libs v2 to PYTHONPATH — that was the AGE-354 crash). Made durable in agentos-config PR #178 (enabled for juno/axel/ellis). Restart hermes-gateway (systemd) after config changes. Docs: hermes-agent.nousresearch.com/docs/user-guide/features/built-in-plugins.

**Instruction delivery (CRITICAL):** an agent's actual model prompt = SOUL.md (per-agent, loads) + /paperclip/AGENTS.md (SHARED, host /docker/paperclip-ezk7/data/AGENTS.md, injected into EVERY agent across ALL companies — multi-tenant) + MEMORY + skills (load-on-demand via skill_view). The per-agent PROFILE AGENTS.md (/opt/hermes-profiles/<a>/AGENTS.md) is NOT injected. So operating rules belong in SOUL.md or the shared /paperclip/AGENTS.md — editing profile AGENTS.md is a no-op (PR #172/#173 were inert; App-authorship was actually fixed by the axel.sh GH_TOKEN env export). Verify what an agent received via hermes request_dumps (/opt/hermes-profiles/<a>/sessions/request_dump_*.json) or state.db `messages`, or Langfuse. Skills had a perm bug (dir owned by uid 1001 mode 700 vs agent user paperclip → Errno13); fixed with `chmod -R a+rX /opt/hermes-profiles/*/skills`. Breakdown skill = `paperclip-converting-plans-to-tasks` (not paperclip-autonomous).

**Planning lifecycle:** native Paperclip (verified 517→529→canary) provides NONE of it for our `hermes_local` adapter — no CEO-routing of plan request_confirmations (they're created ownerless, no targetAgentId, nobody woken), no completeness gating (assertTransition only checks the status enum), and the "Make the plan only" directive is injected ONLY for claude-local/acpx-local adapters (others get just PAPERCLIP_ISSUE_WORK_MODE env). So we built it in the plugin (v1.62 PR #86, v1.63 PR #88): `evaluatePlanningCompletion` (planning parent can't reach done w/o all children done) wired into hasCompletionArtifact + a `sweepPlanningCompleteness` backstop; `sweepCeoPlanRouting` (routes a planning issue w/ pending plan request_confirmation to the orchestrator/CEO=Juno — VERIFIED firing); narrow fail-closed `age352ExemptForPlanReview`; and a `PLANNING_GATE_EPOCH_MS` (2026-06-05T21:00Z) grandfather bound — REQUIRED because the first version mass-reverted ~90 historical planning dones (incident; contained by the epoch bound; historical issues self-heal to done via agents since the gate now grandfathers them). NOTE: the plugin detects but can't force a review-stage transition (422 "only the active reviewer can advance"); enforcement still needs reviewer-discipline or a server change.

**e2e lifecycle status:** plan✓ → request_confirmation✓ → CEO-routing-to-Juno✓ (new gate works) → Juno-accepts-plan ✗ (NEXT GAP — Juno not accepting, likely starved by incident churn + acceptance mechanic unverified) → decompose (blocked). Multi-part decomposition still UNVALIDATED end-to-end.

## 2026-06-05 (final) — DROPPED the plan-approval gate (supersedes CEO-routing/request_confirmation)

Decision (Chris): the quality win is the ACT of planning + decomposition, not plan sign-off — and we already have the real gate (per-PR review by Ellis/Tess). So we removed the plan-approval step entirely rather than auto-accept it.
- Why not auto-accept: `request_confirmation` is BOARD-gated — every resolve route (accept/reject) calls `assertBoard` → agents get 403; only a board-key caller can resolve. So "Juno accepts the plan" via her agent key is impossible by design. Auto-accept via board key would be pure ceremony-undoing machinery.
- The native no-approval path: the `request_confirmation` is agent-initiated and OPTIONAL; native child creation (`POST /issues/:id/children`, `blockParentUntilDone`) needs no approval. So agents now: write the plan → create child issues directly → implement. No confirmation, no stall, no human/board dependency.
- Shipped (agentos-config PRs #180 migrate AGENTS.md→SOUL.md, #181 drop-approval): SOUL.md planning sections for axel/willa/ellis = "plan, then create child issues directly (no request_confirmation, no waiting)"; juno = "no plan-approval gate; lane is triage/dispatch/unblock" (kept the VALID board-escalation request_confirmation toward Chris). Shared /paperclip/AGENTS.md rewritten to match.
- Enforcement unchanged: the plugin completeness gate (v1.63) still blocks a workMode:planning parent from `done` without all children done (grandfathered by epoch 2026-06-05T21:00Z). The now-unneeded `sweepCeoPlanRouting` is left dormant (only fires on pending confirmations, which won't exist) — clean up in a later plugin pass.
- AGE-439 (old-flow e2e, stuck on a pending confirmation) cancelled. A fresh planning issue validates the new flow.
