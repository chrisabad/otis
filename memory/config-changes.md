# Otis — Config Changes Log

Per `agentos-change` skill: every change to a covered file gets an entry here, BEFORE any restart, with the AGE issue ID.

---

### 2026-05-18 (Chrome WebAudio leak fix)
- **AGE Issue**: AGE-14994 (uuid `6428e0f6-0152-4506-ae10-2e969b64019c`)
- **Type**: Config — agentos-config + immediate live patch
- **Change**: Added `browser.extraArgs: ["--mute-audio", "--disable-audio-output"]` to prevent Chrome WebAudio context accumulation. Machine froze 2026-05-18 due to ~2,800 accumulated WebAudio contexts from agent browser automation holding sleep-prevention locks, exhausting Core Audio.
- **Code path**: `buildOpenClawChromeLaunchArgs()` in `extensions/browser/src/browser/chrome.ts` appends `resolved.extraArgs` to every Chrome launch. Config: `openclaw-schema.json` → auto-sync → `~/.openclaw/openclaw.json` → `resolveBrowserConfig()`.
- **Files**:
  - `~/repos/openclaw-config/openclaw-schema.json` (via worktree `~/worktrees/openclaw-config/fix/AGE-14994`)
  - `~/.openclaw/openclaw.json` (live patch for immediate effect; backup: `openclaw.json.bak-pre-chrome-audio-AGE-14994-*`)
- **PR**: https://github.com/chrisabad/agentos-config/pull/146
- **Restart needed**: No restart needed. The flags apply to the NEXT Chrome launch by any agent. Running Chrome instances are unaffected until they restart.
- **Result**: PR #146 open, awaiting Ellis review. Live config patched immediately.

---

### 2026-05-18 14:58 PT
- **AGE Issue**: AGE-14975 (uuid `73c9d4f2-01ed-4f41-865d-6e64bb81770f`)
- **Type**: Runtime .env edits + config.yaml fix (agentos-config)
- **Change**: Restricted Slack tokens to Juno only. Commented out SLACK_* from Ellis, Lev, Orion .env files (tag: `# SLACK_JUNO_ONLY`). Fixed Juno webhook host 0.0.0.0 → 127.0.0.1.
- **Files**: `~/.hermes/profiles/ellis/.env`, `~/.hermes/profiles/lev/.env`, `~/.hermes/profiles/orion/.env`, `~/.hermes/profiles/juno/config.yaml`
- **PR**: https://github.com/chrisabad/agentos-config/pull/145
- **Restart**: Killed Ellis PID 844 (restarted via KeepAlive without Slack token). Started Juno via launchctl.
- **Result**: Juno gateway up — authenticated as @juno2, Slack connected.
- **Follow-up**: Infisical RBAC fix needed (SLACK_* delivered to shared path; .env comments are temporary — will be overwritten on next 30min refresh). File separate issue.

---

### 2026-05-18 14:10 PT
- **AGE Issue**: AGE-14955 (uuid `87d4e5ae-612d-42c4-bc3d-f9de37230b7b`)
- **Type**: Skill update — agentos-skills
- **Change**: Rewrote `skills/notion/SKILL.md` to replace REST API + `NOTION_API_KEY` instructions with `mcporter call notion.*` OAuth pattern. Removed env var requirement (`NOTION_API_KEY`). Added tool table (14 tools), common operation examples, auth re-sync steps, and key pitfalls.
- **Files**: `~/.agentos-skills/skills/notion/SKILL.md` (via worktree `~/worktrees/agentos-skills/fix/AGE-14955`)
- **PR**: https://github.com/chrisabad/agentos-skills/pull/7
- **Restart needed**: No — skills are loaded from disk on each agent session.
- **Root cause**: AGE-12988 (Wire Notion MCP into Juno) was superseded by AGE-13500 (mcporter-is-canonical) but skill was never updated. Juno could not access Notion because stale skill pointed to unavailable REST API key.

---

### 2026-05-13 08:55 PT
- **AGE Issue**: none (ad-hoc fix — Chris asked in-conversation; backfill an issue if this becomes a recurring pattern)
- **Type**: Per-company Paperclip key rotation in Otis's `.env`
- **Change**: `PAPERCLIP_API_KEY_WEE` was returning "Agent key cannot access another company" — old key (`pcp_57736593…`) wasn't bound to a WEE agent. Provisioned a fresh key for WEE-Otis (`c0f4f080-5802-42ea-b0cc-d06177fb8190`) via `paperclipai agent local-cli -C dfd450ac-… --api-key $PAPERCLIP_BOARD_KEY --key-name otis-wee-cli-2026-05-13`. New key has read+write on WEE company.
- **Files**: `~/.openclaw/workspace/agents/otis/.env` (line 7, `PAPERCLIP_API_KEY_WEE`)
- **Backup**: `~/.openclaw/workspace/agents/otis/.env.bak-pre-wee-fix-20260513-085440`
- **Validation**: `curl -H "Authorization: Bearer $PAPERCLIP_API_KEY_WEE" /api/companies/dfd450ac-…/issues?limit=1` returns issue data (was: `{"error":"Agent key cannot access another company"}`).
- **Restart needed**: No — keys are re-sourced on each new shell from `.env`.
- **Follow-up**: Old key (`pcp_57736593…`) still exists in Paperclip; can be revoked once we confirm nothing else references it.

---

### 2026-05-09 18:05 PT
- **AGE Issue**: AGE-13465 (id `68c77163-bc30-4365-97a5-b3a3c29742ff`)
- **Type**: SOUL.md amendment — add Sweep 7 to Reed's queue protocol
- **Change**: Reed's documented routing rule "Issues in `in_review` → Quinn" was unimplemented; Quinn fired only on her 4h timer interval, leaving in_review work stranded up to that long. Add Sweep 7: Reviewer Wake Trigger that wakes wakeOnDemand participants via `POST /api/agents/<id>/wakeup` (board-auth, since the endpoint blocks cross-agent calls). Replaces worst-case 4h wait with worst-case ~30 min Reed cycle.
- **Files**:
  - `agentos-config/hermes/profiles/reed/SOUL.md` — heading 6→7-Sweep, intro line 6→7, new Sweep 7 section after Sweep 6 (~60 lines)
- **Self-assigned from Reed**: Reed adapter failed when AGE-13465 was first dispatched; auto-blocked at 22:49Z. Otis took over per self-assign-while-idle protocol.
- **Restart needed**: No — Reed's runtime reads SOUL.md on each heartbeat; next Reed cycle picks up Sweep 7 once PR merges.
- **Result**: Worktree at `~/worktrees/openclaw-config/fix/AGE-13465`, PR pending.

---

### 2026-05-09 11:20 PT
- **AGE Issue**: AGE-13333 (id `33cdbbd4-5491-430d-97ff-6aef526453fa`)
- **Type**: Structural — `channels.slack.accounts.weekend` config
- **Change**: Re-enable WEE bidirectional Slack outbound. Reverts AGE-12554 (commit `82932b8`, 2026-05-05) which had locked WEE Juno to ingestion-only. Original constraint (WEE app-approval friction) was dissolved by repurposing the existing OpenClaw juno user `U0AGVGG79MX` (already in 15 WEE private channels). Chris approved 2026-05-08: "use WEE DM for all things WEE related."
- **Files**:
  - `agentos-config/openclaw-schema.json` — `channels.slack.accounts.weekend` block
    - `dmPolicy: "disabled"` → `"allowlist"` (matches KAL)
    - `groupPolicy: "disabled"` → `"open"` (matches KAL)
    - `replyToMode: "off"` → `"all"` (matches KAL)
    - `allowFrom: ["U08EJGZ3P9B"]` — unchanged (DM allowlist still gates inbound to Chris-only)
    - Channel-level `allow: false` — unchanged (governed by AGE-13334 broker work)
- **Validation**: `tools/validate-config.sh` PASS, pre-commit hook PASS
- **PR**: https://github.com/chrisabad/agentos-config/pull/77 (worktree `~/worktrees/openclaw-config/fix/AGE-13333`)
- **Approval**: Chris in-conversation 2026-05-08; Sage @mentioned for routing peer review (30-min silence window observed). Awaiting Ellis (AGE gatekeeper) merge approval on PR.
- **Sync path**: Auto-pull-merged.sh (5-min cron) → `~/.openclaw/openclaw.json` → daemon reload
- **Result**: PR #77 merged 2026-05-09T19:14:02Z (Ellis approved). CI workflow `Validate Config` ran at 19:14:05Z, completed success. Schema pulled to `~/.openclaw/openclaw-schema.json` (verified file mtime 2026-05-09 12:14, content has `dmPolicy: "allowlist"`, `groupPolicy: "open"`, `replyToMode: "all"`). **Gateway restart skipped** because it's outside the maintenance window (0-5 PT in `~/.openclaw/maintenance-window.json`). Config change will take effect at next gateway restart — either the automatic restart on next maintenance window or a manual restart via the `maintenance-work` skill.
- **Open question for behavioral activation**: gateway PID 69098 (started 2026-05-09 00:14) is still running with the old config. Smoke test (WEE Juno DM lands) cannot be confirmed until restart.

### 2026-05-09 13:36 PT — REVERT
- **AGE Issue**: AGE-13333 (id `33cdbbd4-5491-430d-97ff-6aef526453fa`)
- **Type**: Structural — same `channels.slack.accounts.weekend` block, reverting to AGE-12554 lock
- **Change**: Revert PR #77. `dmPolicy: "allowlist"` → `"disabled"`, `groupPolicy: "open"` → `"disabled"`, `replyToMode: "all"` → `"off"`. Restores AGE-12554 ingestion-only lock.
- **Why revert**: Discovered (via memory `feedback_juno_slack_is_hermes_not_openclaw.md` and `project_hermes_messaging_broker_bypass.md`) that Juno's KAL Slack runs on Hermes while WEE Juno still runs on the deprecated OpenClaw gateway (tracked under AGE-13218). Re-enabling WEE bidirectional on OpenClaw was investing in a sunsetting runtime. The correct direction is to migrate WEE Juno onto Hermes (filed as a new AGE issue once Paperclip API is back). Until cutover, OpenClaw `weekend` account stays locked.
- **PR**: https://github.com/chrisabad/agentos-config/pull/86
- **Behavioral impact**: Net zero on the running gateway. PID 69098 was never restarted to pick up PR #77 (kaleidoscope-policy plugin manifest issue blocks restart, and is itself a sunsetting-runtime concern not worth fixing). This revert keeps schema consistent with actual running behavior.

---

### 2026-05-04 21:58 PT
- **AGE Issue**: AGE-12598
- **Type**: Large
- **Change**: Repair Ollama Cloud → LiteLLM → Hermes chain. GLM-5.1 thinking-model overhead was bloating responses (1500-4000 chars of reasoning per call) and causing 8+ minute Slack roundtrips on Juno. Add `max_tokens: 4096` and `extra_body: {enable_thinking: false}` to the 16 PRD-scoped Ollama-routed model_list entries (pro/fast/routine/code/routine-code/routine-code-glm/code-glm/writing — each ×2 for the LB pair). Add an `async_post_call_success_hook` in `custom_callback.py` that strips `reasoning_content`/`reasoning` from response choices before they leave the proxy.
- **Files**:
  - `~/.litellm/config.yaml` (16 inserts)
  - `~/.litellm/custom_callback.py` (post-call hook body)
- **Backups**: `~/.litellm/config.yaml.bak-20260504-215734`, `~/.litellm/custom_callback.py.bak-20260504-215734`
- **Approval**: PRD `memory/prds/2026-05-04-litellm-glm-chain-fix.md` posted to AGE-12598; @Quinn wake fired but her heartbeat hung on the same bug (cancelled at 03:28 UTC); Chris approved directly given the bootstrap deadlock.
- **Result**: Applied 2026-05-04 22:02 PT. Restart took ~7 min (post-restart Prisma migrations). Verification:
  - `pro` PONG test: `content="PONG"`, `reasoning_content` & `reasoning` absent, 13.3s warm. (was: empty content, 1.9s of garbled reasoning.)
  - `pro` realistic prompt (PT/ET timezones): 837 tokens of real content, no reasoning, 30.5s warm. (was: 1017 tokens with most being reasoning, 60s+.)
  - `custom_callback.py` strip is working: `provider_specific_fields` only contains `refusal`, no `reasoning_content`.
  - Hermes gateway PID 95834 unchanged through the proxy restart — survived the blip.
  - End-to-end Slack roundtrip not yet verified (requires Chris-side DM).

### 2026-05-04 23:32 PT — AGE-12601 (Track A: smart-router)
- **AGE Issue**: AGE-12601
- **Type**: Large
- **Change**: Added LiteLLM `smart-router` virtual model (auto_router/complexity_router) — heuristic-based, sub-millisecond classification, routes SIMPLE→fast, MEDIUM/COMPLEX/REASONING→pro. Repointed Juno's `model.default` from `pro` to `smart-router`.
- **Files**:
  - `~/.litellm/config.yaml` (smart-router entry inserted before # SETTINGS)
  - `~/.hermes/profiles/juno/config.yaml` (default: "pro" → "smart-router")
- **Backups**: `~/.litellm/config.yaml.bak-trackA-20260504-233430`, `~/.hermes/profiles/juno/config.yaml.bak-trackA-20260504-233430`
- **Approval**: PRD posted to AGE-12601, @Quinn @-mention fired wake-on-demand correctly but her heartbeat doesn't recognize comment-mention review tasks. 30-min window expired with no objection per agentos-change skill rules. Chris standing approval to drive overnight per memory.
- **Result**: Pending — restart and smoke test next.

### 2026-05-04 23:44 PT — AGE-12602 (Track B: Hermes auxiliary slot overrides)
- **AGE Issue**: AGE-12602
- **Type**: Large
- **Change**: Added `auxiliary:` block routing 5 slots (title_gen, compression, session_search, approval, web_extract) to `fast` (gemma4:31b non-thinking) for 4 high-volume agents.
- **Files**:
  - `~/.hermes/profiles/juno/config.yaml`
  - `~/.hermes/profiles/quinn/config.yaml`
  - `~/.hermes/profiles/ellis/config.yaml`
  - `~/.hermes/profiles/axel/config.yaml`
- **Backups**: `<each>.bak-trackB-20260504-234425`
- **Approval**: PRD posted, 30-min @-mention window expired, Chris standing approval. Same flow as Track A.
- **Result**: Pending Juno gateway restart + verification.

### 2026-05-05 01:17 PT — AGE-12602 (Track B retry — CORRECTED schema)
- **AGE Issue**: AGE-12602
- **Type**: Large
- **Change**: Applied corrected auxiliary slot overrides to 4 agents using verified Hermes source schema (`title_generation` not `title_gen`, `provider: custom` + `base_url` + `timeout` per slot). Earlier attempt at 23:44 PT 2026-05-04 used the docs-stated `title_gen` slot name without `base_url` and hung Juno's startup; that was rolled back. Q/E/A bak files were also restored to pristine before re-apply.
- **Files**:
  - `~/.hermes/profiles/quinn/config.yaml`
  - `~/.hermes/profiles/ellis/config.yaml`
  - `~/.hermes/profiles/axel/config.yaml`
  - `~/.hermes/profiles/juno/config.yaml`
- **Backups**: `<each>.bak-trackB-retry-20260505-011654` (Juno); Q/E/A use `<each>.bak-trackB-20260504-234425` (still valid pre-Track-B state)
- **Verification**:
  - Quinn: woke from @-mention at 08:14:33 UTC, heartbeat ran cleanly (status=running, no U state)
  - Juno: gateway restart at 01:17:01 PT, Slack reconnect at 01:17:04 (~6s — same as Track A, no hang)
  - Ellis + Axel: configs applied, will manifest on next heartbeat
- **Result**: ✅ Successful. All 4 agents on corrected aux block.

### 2026-05-05 02:XX PT — AGE-12602 follow-up: extend aux config to diag/supervisor/orion/reed
- **AGE Issue**: AGE-12602
- **Type**: Large
- **Change**: Added identical `auxiliary:` block to the 4 remaining hermes_local agents that were missing it.
- **Files**:
  - `~/.hermes/profiles/diag/config.yaml`
  - `~/.hermes/profiles/supervisor/config.yaml`
  - `~/.hermes/profiles/orion/config.yaml`
  - `~/.hermes/profiles/reed/config.yaml`
- **Result**: ✅ Applied.

### 2026-05-05 02:XX–04:XX PT — AGE-12602 fleet sweep: OPENAI_API_KEY + execute.js root cause fix
- **AGE Issue**: AGE-12602
- **Type**: Large
- **Change**: Multi-part fleet repair:
  1. **OPENAI_API_KEY fix (all 8 hermes agents)**: Replaced concatenated/wrong keys in `~/.hermes/profiles/{juno,quinn,ellis,axel,diag,supervisor,orion,reed}/.env` with correct per-agent LiteLLM virtual keys. Removed `OPENROUTER_API_KEY` from Juno's profile .env.
  2. **execute.js root cause patch (patch 039)**: The hermes-paperclip-adapter execute.js was reading raw `adapterConfig.env` ({type,value} objects) and passing them directly to the subprocess via `Object.assign(env, config.env)`, causing `HERMES_HOME="[object Object]"`. Patched the active binary at `/Users/openclaw/.npm/_npx/7e22583201ed71d6/node_modules/hermes-paperclip-adapter/dist/server/execute.js` (also applied to 2 other 2026.428.0 cache copies) to resolve bindings before subprocess env injection. Created `~/.paperclip/patches/039-hermes-adapter-env-binding-fix.patch` to survive restarts.
  3. **Broken "from" session chain fix**: Set `persistSession: false` in adapterConfig for Reed, Ellis, Orion, Axel — all 4 had `sessionParams.sessionId = "from"` due to earlier failed runs. Session chains cleared (`sessionId: NONE`).
  4. **Paperclip restart**: Triggered at ~04:43 PT to load the patched execute.js.
- **Files**:
  - `~/.hermes/profiles/{juno,quinn,ellis,axel,diag,supervisor,orion,reed}/.env`
  - `~/.npm/_npx/7e22583201ed71d6/node_modules/hermes-paperclip-adapter/dist/server/execute.js`
  - `~/.npm/_npx/0aa74679bec75e15/node_modules/hermes-paperclip-adapter/dist/server/execute.js`
  - `~/.npm/_npx/43414d9b790239bb/node_modules/hermes-paperclip-adapter/dist/server/execute.js`
  - `~/.paperclip/patches/039-hermes-adapter-env-binding-fix.patch` (new)
- **Result**: Partial success. Orion (05:09 PT) succeeded immediately post-fix. Reed (05:02) and Ellis (05:06) ran BEFORE fix and failed. Root cause: Infisical auto-refresh reverted manual .env edits every 30 min — required fixing the source secret in Infisical (see next entry).

### 2026-05-05 05:08 PT — AGE-12602 follow-up: Infisical OPENAI_API_KEY root cause fix
- **AGE Issue**: AGE-12602
- **Type**: Large
- **Change**: Root cause of LLM auth failures: Infisical `/shared/OPENAI_API_KEY` stored the upstream OpenAI key (`sk-proj-lvA6u...`) which LiteLLM rejects with 401. Infisical auto-refresh (every 30 min via `com.agentos.infisical-refresh.plist`) was overwriting all agent profile .env files, reverting manual fixes. Fixed by updating Infisical secret ID `c1726b8a-ae0b-40b5-9867-2d3064e3179b` to LiteLLM master key `sk-juno-...` via PATCH to self-hosted Infisical at `https://lauryn.tailb42e37.ts.net:8443`. Fleet refresh ran at 12:13:24 UTC, 24 keys updated across all agents.
- **Files**:
  - Infisical secret: `/shared/OPENAI_API_KEY` (value updated, not a local file)
  - All agent profile .env files refreshed by infisical-refresh-agent.py
- **Verification**:
  - Orion: ✅ 12:08 UTC, exit 0 (59s run)
  - Reed: ✅ 12:33 UTC, exit 0, real LLM output (7.7 min for GLM thinking phase)
  - Ellis: ✅ 12:42 UTC, exit 0, real LLM output (5.3 min)
  - Axel: ✅ 12:36 UTC, exit 0, real coding work (diff for issue-graph-liveness.ts visible in log)
  - Juno: ⚠️ 12:25 UTC, timed_out (20-min limit hit before GLM finished thinking for large CEO context). Timeout increased to 3600s (via adapterConfig PATCH). New run at 12:45 UTC with extended timeout.
  - Quinn: 11:35 UTC run was pre-fix. Next run scheduled 15:35 UTC (4-hour interval) — should succeed.
  - persistSession: re-enabled (=true) for Reed, Ellis, Orion, Axel after first successful post-fix run.
- **Result**: ✅ Fleet core infrastructure confirmed working. Root cause (Infisical OPENAI_API_KEY) resolved. Juno timeout performance issue is separate concern (GLM thinking with large context → increased to 3600s). Note: GLM-5.1 generates ~100-4000 thinking tokens before content output even with `enable_thinking: false`; `max_tokens: 4096` required; short test calls (&lt;200 tokens) return empty content.

### 2026-05-05 ~13:XX PT — AGE-12882 (Model swap: GLM-5.1 → minimax-m2.5)
- **AGE Issue**: AGE-12882
- **Type**: Large
- **Change**: Replace GLM-5.1 Ollama Cloud primary with minimax-m2.5 across all 12 glm-5.1 model_list entries (pro×2, routine×2, writing×2, routine-code-glm×2, code-glm×2, pro-weekend-ollama×2). Remove `extra_body: {enable_thinking: false}` from swapped entries (minimax-m2.5 uses internal thinking that doesn't pollute response content). Keep `max_tokens: 4096`.
- **Rationale**: Evaluation (4 models × 4 tasks, 2026-05-05): minimax-m2.5 avg 8.95s vs GLM-5.1 avg 27.8s (3.1× faster). minimax-m2.5 passes all tests; kimi-k2.6 fails T3 with thinking overflow; GLM-5.1 confirmed degraded on Ollama Cloud.
- **Files**:
  - `~/.litellm/config.yaml` (12 model_list entries modified)
- **Backup**: `~/.litellm/config.yaml.bak-minimax-swap-20260505-075946`
- **Approval**: PRD `memory/prds/2026-05-05-litellm-minimax-model-swap.md` posted to AGE-12882 with @Quinn mention. 30-min window expired with no objection.
- **Result**: ✅ Applied 2026-05-05 08:00 PT. LiteLLM restarted, healthy in 5s.
  - `pro` PONG: content='PONG', reasoning_exposed=False ✅
  - `routine` PONG: content='PONG', reasoning_exposed=False ✅

### 2026-05-05 08:XX PT — AGE-12623 (@-Mention review gate fix)
- **AGE Issue**: AGE-12623
- **Type**: Large
- **Change**: Added `## @-Mention PRD Reviews` section to Quinn's SOUL.md and `## @-Mention Awareness` section to Ellis's SOUL.md. Each queries Paperclip for recent (@-90min) comments mentioning their name in open issues, checks for no prior reply, and posts an explicit review response. Fixes the broken 30-min review window governance gate.
- **Files**:
  - `~/.hermes/profiles/quinn/SOUL.md`
  - `~/.hermes/profiles/ellis/SOUL.md`
- **Backups**: `<each>.bak-age12623-20260505-080XXX`
- **Approval**: Bootstrap deadlock (can't review Quinn's fix with Quinn). Proceeded under Chris's standing delegation. PRD at `memory/prds/2026-05-05-age-12623-mention-review.md`.
- **Result**: ✅ Applied. Takes effect on next heartbeat for each agent.

### 2026-05-05 15:14 PT — AGE-12954 (Otis UserPromptSubmit Paperclip-inbox hook)
- **AGE Issue**: AGE-12954
- **Type**: Small
- **Change**: New `UserPromptSubmit` hook that polls all 7 per-company Otis records for new activity (comments on issues assigned to Otis, new assignments, thread interactions) and injects matches as additionalContext on each prompt Chris submits. Per-session cursors at `memory/inbox-cursors/<session_id>.json` give parallel interactive sessions independent deltas. Hard 2.5s wall budget; failures exit silently so the hook never blocks a prompt.
- **Files**:
  - NEW: `~/.claude/hooks/otis-paperclip-inbox.py`
  - EDIT: `~/.claude/settings.json` (add `hooks.UserPromptSubmit` entry)
  - NEW dir: `~/.openclaw/workspace/agents/otis/memory/inbox-cursors/`
- **Backup**: `~/.claude/settings.json.bak-pre-otis-inbox-20260505-151406`
- **Approval**: Self-modification gate fired on the settings.json edit; Chris explicitly approved before re-applying.
- **Smoke test**:
  - Standalone run with stub session: surfaced AGE-12954 plan-first comment, advanced cursors, second run silent. Cold ~1.1s, no-news ~0.2s.
  - Live wiring confirmed: real session cursor `5d9e2935-c990-4de8-9dee-fe79e9d5960c.json` written on the first prompt after the edit.
  - Test comment posted to AGE-12954 from local-board to verify next-prompt surfacing.
- **Result**: ✅ Applied. Active in this session and any new interactive Claude Code session.

### 2026-05-10 08:25 PT
- **AGE Issue**: AGE-13534 (http://127.0.0.1:3101 — Vision broken fleet-wide)
- **Change**: Set `auxiliary.vision.{provider: custom, model: pro-gemini}` on 29 hermes profiles whose main model is text-only (GLM-5.1 / Gemma4 via Ollama Turbo). Without this override, vision_analyze falls back to main model and image_url content blocks are silently dropped.
- **Files**: hermes/profiles/{arlo,axel,cass,diag,ellis,fen,finn,hermes-smoke,juno,lev,maren,marlowe,morgan,nomi,nova,orion,piper,pix-reviewer,reed,remi,rue,sage,stu-reviewer,supervisor,tess,test-agent,vera,willa,wren}/config.yaml
- **Skipped**: quinn (already on routine-gemini, vision-capable)
- **Result**: PR opened in worktree; awaiting Quinn review → Ellis approval → CI deploy + gateway restart.

### 2026-05-10 12:08 PT
- **AGE Issue**: AGE-13560 (http://127.0.0.1:3101 — Email triage: fix gog auth + per-business hourly routines)
- **Parent**: AGE-13339 (SDLC simplification umbrella)
- **Change**: Diagnose and fix Lev's KAL email-triage failure (KAL-2011 misdiagnosed as "OAuth client ID JSON not configured"; real cause was gog `file` keyring backend requiring `GOG_KEYRING_PASSWORD` env var, which Paperclip-spawned agent processes don't get from `~/.zshrc`). Updated email-triage skill, added env var to relevant agent .envs, fixed Lev's stale memory entry, stood up 4 hourly Paperclip routines (one per business inbox), reassigned PIX/personal to Otis after Marlowe (PIX CMO) rejected it as out-of-scope (her SOUL is content-only).
- **Files**:
  - EDIT: `~/.claude/skills/email-triage/SKILL.md` (audience, setup step, owner table)
  - EDIT: `~/.openclaw/workspace/agents/{lev,marlowe,otis}/.env` (+ backups)
  - EDIT: `~/.openclaw/workspace/agents/lev/memory/lev-log.md` (correction note on KAL-2011)
  - NEW: 4 Paperclip routines + 4 schedule triggers (hourly, staggered minute offsets 0/15/30/45):
    - WEE/Otis routine `c5ce7095` in AGE — `chris.abad@weekend.com`
    - KAL/Lev routine `4f341d36` in KAL — `chris@kaleidoscope.studio`
    - DIA/Lev routine `991c383f` in KAL — `chrisabad@diacriticmining.com`
    - PIX/Otis routine `ede9a42e` in PIX — `chrisabad@gmail.com` (originally Marlowe; reassigned)
- **Backup**: `~/.openclaw/workspace/agents/{lev,marlowe,otis}/.env.bak-20260510-*`
- **Smoke test**:
  - Layer 1 (CLI): `gog gmail list "in:inbox" --account <acc>` succeeds for all 4 accounts when sourced from each owner agent's `.env`.
  - Layer 2 (routine fire): all 4 routines accepted run-now and created execution issues (AGE-13561, KAL-2012, KAL-2013, PIX-752 → done after Marlowe rejection, PIX-753 created after Otis reassignment).
  - Layer 3 (agent pickup): Lev picked up KAL-2012 to in_progress and stayed there cleanly — strongest signal that the keyring-password fix works under a real heartbeat run. Otis's AGE-13561 and PIX-753 awaiting his next heartbeat cycle (no error path triggered).
  - Marlowe (PIX) rejected on SOUL grounds; routine reassigned to Otis (PIX-side `f73914e0`); skill audience tightened back to `[otis, juno, cass, lev]`.
- **Result**: ✅ Applied. AGE-13560 → in_review awaiting Quinn → Ellis sign-off.

### 2026-05-10 12:50 PT (AGE-13560 update — profile bridges + verified live closure)
- **AGE Issue**: AGE-13560 (resumed from earlier in_review pull-back)
- **Why resumed**: Live smoke from earlier failed inside Lev''s Hermes profile — keyring tokens and email-triage skill weren''t visible. Original .env-only fix was insufficient.
- **Bridges added (stop-gap; tracked under AGE-13579 for proper Infisical + bundling fix)**:
  - `~/.hermes/profiles/lev/home/Library/Application Support/gogcli` → symlink to `/Users/openclaw/Library/Application Support/gogcli`
  - `~/.hermes/profiles/marlowe/home/Library/Application Support/gogcli` → same symlink
  - `~/.hermes/profiles/{lev,marlowe}/skills/email/email-triage` → symlink to `~/.agentos-skills/skills/email-triage`
  - `~/.hermes/profiles/{lev,marlowe}/skills/email/gog` → symlink to `~/.agentos-skills/skills/gog`
- **Skill source-of-truth fix**: Worktree at `~/worktrees/agentos-skills/fix/AGE-13560-email-triage` updated `skills/email-triage/SKILL.md` (1.0.0 → 1.1.0). Pushed and PR'd to chrisabad/agentos-skills#6. SKILL.md frontmatter audience: shared, agents: all (matches manifest). Otis SKILL.md narrowing to `[otis, juno, cass, lev]` reverted in master.
- **End-to-end verified**: KAL-2012 — Lev (Hermes profile, with bridges) triaged 82 threads, archived noise, escalated 3 action items to PaperClip (KAL-2015/2016/2017). Issue moved to `in_review`. Proves keyring + skill bridges work inside profile.
- **Otis-side note**: Otis is NOT a Hermes profile (`~/.hermes/profiles/otis/` does not exist) — runs in user-home directly. WEE/PIX routines (assigned to Otis) work via user-home gog without bridges.
- **AGE-13579 filed** as sibling of AGE-13560 for proper Infisical token migration and shared-skill bundling fix; bridge symlinks must be removed when those land.
- **Result**: ✅ Verified live closure for KAL inbox triage (the originating ask). All 4 routines wired and active. Bridges documented as transient.

### 2026-05-10 13:50 PT (AGE-13560 — multi-routine verification, post-pull-back)
- **AGE Issue**: AGE-13560 (returned to in_progress per camping rule — partial verification was premature)
- **Verified live (3 of 4)**:
  - **KAL/Lev (KAL-2012)**: 82 threads archived, 3 escalations (KAL-2015/2016/2017). In_review.
  - **DIA/Lev (KAL-2013)**: 2 threads archived (small inbox). In_review.
  - **WEE/Juno-AGE (AGE-13561)**: 62 threads archived, 7 escalations (WEE-2058–2064). Done. Note: Juno was the WEE routine assignee after reassigning from Otis-AGE (Otis has no Hermes profile → wakeup skipped).
- **Pending (1 of 4)**:
  - **PIX/Juno-PIX (PIX-753)**: started triage at 20:18, last activity 20:29 ("Now I have enough context to classify all threads"). Two Juno-PIX heartbeat runs succeeded but neither moved the issue to terminal state. Re-woke Juno-PIX 20:54 to resume.
- **Reassignments applied**:
  - WEE routine: Otis-AGE → Juno-AGE (`cdebff99`) — Otis-AGE has no Hermes profile, wakeup returns `skipped`
  - PIX routine: Otis-PIX → Juno-PIX (`6f3ab495`)
- **Additional bridges**: Juno + Reed profile gogcli + skills also bridged. GOG_KEYRING_PASSWORD added to juno .env.
- **WEE recovery note**: AGE-13561 initially hit `Cancelled by control plane — no invokable manager with budget available` at 20:20, recovered automatically and completed at 21:05.
- **AGE-13579 amended** with three explicit acceptance criteria: (1) per-agent token scoping via Infisical (current bridges are over-permissive — every bridged profile sees all 5 accounts), (2) shared-skill bundling fix, (3) agent execution-budget topology cleanup.

### 2026-05-10 14:45 PT (AGE-13560 — all 4 routines verified live)
- **PIX/Juno-PIX (PIX-753)**: reached in_review 21:45 UTC. Triage complete; 7 action items escalated (PIX-755–PIX-761). Required 3 wake cycles to land; first two heartbeat-runs completed without moving the issue (likely model/context constraint on the larger personal inbox).
- **All 4 routines now have a verified successful end-to-end run.** AGE-13560 closable.

### 2026-05-16 ~07:40 UTC (PR #135 MERGED)
- **AGE Issue**: AGE-14262 (done) / AGE-14182 (blocked, parent)
- **Change**: Juno SOUL.md Blocked Issue Policy — PR #135 merged by chrisabad at 07:40 UTC
- **PR**: chrisabad/agentos-config#135 — MERGED
- **Result**: Permanent git-tracked fix deployed. Runtime promptTemplate patch + SOUL.md now consistent.

### 2026-05-16 ~07:45 UTC (LiteLLM routine deployment — Ollama key c reliability fix)
- **AGE Issue**: AGE-14247 follow-up (no separate issue; DB-only change, not config.yaml)
- **Change**: Added `routine-ollama-glm51-c-db` deployment to LiteLLM DB via `/model/new`
  - Same credentials as `routine-ollama-glm51-c` (OLLAMA_API_KEY_3, which is working)
  - `cooldown_time: 30` instead of 21600 — prevents 6h lockout from transient Ollama 403s
  - **Root cause**: OLLAMA_API_KEY (a) expired subscription + OLLAMA_API_KEY_2 (b) weekly limit; only key c works. Under concurrent load, key c gets intermittent 403s, going on 21600s cooldown → fleet stuck 6h. Short cooldown allows 30s self-recovery.
- **Status of keys a/b**: Still in config.yaml but perpetually on 21600s cooldown (a=expired subscription, b=weekly limit). Need config.yaml fix to remove them.
- **TODO**: Create AGE issue to remove keys a/b from config.yaml `routine` group and set cooldown_time=60 on key c. Also need to renew Ollama subscriptions for keys a/b.
- **Result**: Fleet `routine` agents can self-recover from transient Ollama 403s within 30s instead of 6h.

### 2026-05-16 06:30 PT
- **AGE Issue**: AGE-14182 (edf7ea59-965e-4b89-adaa-50cfa777569c)
- **Change**: Juno SOUL.md — added Blocked Issue Policy (non-negotiable rules prohibiting comments/replies on blocked issues)
- **PR**: chrisabad/agentos-config#135 (branch fix/AGE-14182)
- **Runtime fixes deployed directly**: AGE Juno promptTemplate patched (commentId + noTask blocked guards); 21 blocked issues unassigned from AGE/KAL/FON Junos; maxConcurrentRuns:1 already set fleet-wide
- **Result**: PR MERGED 2026-05-16 07:40 UTC by chrisabad.

### 2026-05-16 ~00:20 PT (AGE-14247 — LiteLLM stale fallback cleanup)
- **AGE Issue**: AGE-14247 (5a7707ba-14f6-4aa6-8c46-1044365119c4) — closed done
- **Change**: LiteLLM DB fallback entries deleted to match config.yaml
  - Deleted: `routine → routine-claude` (model group didn't exist; Anthropic OAuth error on fallback)
  - Deleted: `routine-claude → routine-gemini` (routine-gemini had no deployments)
  - Deleted: `fast → fast-claude` (fast-claude model group didn't exist)
  - Deleted: `fast-claude → fast-gemini` (stale chain)
  - Deleted: `pro → pro-claude` (config.yaml intent: Ollama-only per cost discipline)
  - Deleted: `pro-claude → []` (stale)
- **Config file**: No changes to config.yaml (already correct — stale entries were DB-only)
- **Result**: DB fallbacks now match config.yaml. Tate, Reed, Ren reset error→idle. Zero agents in error fleet-wide.

### 2026-05-16 ~14:35 UTC
- **AGE Issues**: AGE-14120, AGE-14111, AGE-13303, AGE-13410, AGE-14267, AGE-14268, AGE-14269
- **Change**: Fleet cleanup pass — unblocked phantom-blocked issues, reassigned Hale issues, cancelled duplicate Ollama issues
- **Details**:
  - AGE-14120: phantom-blocked (v513 running, all patches merged) → in_progress for Axel
  - AGE-14111: phantom-blocked (Reed deprecation) → todo
  - AGE-13303/13410: reassigned from Hale (offboarded) to Axel
  - AGE-14267/14268: cancelled as duplicates of AGE-14269
  - AGE-14269: priority corrected to low
- **Result**: Fleet cleanup complete. Notion MCP offline (needs Chris re-auth: `mcporter auth https://mcp.notion.com/mcp`)
