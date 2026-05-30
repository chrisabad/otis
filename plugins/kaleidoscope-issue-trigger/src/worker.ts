// Source recovered from dist/worker.js.map on 2026-05-30 and updated with all fixes.
// This file IS the authoritative source. dist/worker.js must be rebuilt from this source.
// Build: npm install && npm run build  (esbuild, see package.json)
// Deploy: scp dist/worker.js root@100.117.92.5:/docker/paperclip-ezk7/data/plugins/kaleidoscope-issue-trigger/dist/worker.js
//
// Fixes applied 2026-05-30 (also reflected in dist/worker.js on VPS):
//   - A.4: !issue.executionPolicy → !issue.executionPolicy?.stages?.length
//   - Prefix detection (isGateIssue/needsApproval) removed; approval always applies
//   - Orchestrator wakeup dedup: shouldEscalateToOrchestrator() 30s per-company window
//   - Dispatcher dead code removed (3 wakeup blocks retired with dispatcher role)
//   - Manifest capabilities updated (issues.write, comments.write, agents.manage)

/**
 * Issue Trigger Plugin — v1.44.0
 *
 * Added in v1.42.0 (AGE-11747 sweep clears execution fields on PASS):
 * - sweepStrandedReviewerVerdicts now clears executionRunId, executionLockedAt,
 *   executionAgentNameKey, and executionState when transitioning to done on PASS.
 *   Previously, the stale timed_out executionRunId was left on the issue, causing
 *   CQR to immediately revert done → in_progress → in_review, creating an infinite
 *   review loop whenever Ollama latency exceeded the execution lock timeout (~77s).
 *
 * Added in v1.37.0 (AGE-8553 recovery cascade guard):
 * - Recovery issue blocker now checks originKind for stranded_issue_recovery
 *   and adds cascade detection:
 *     1. Depth limit: if ancestry chain has >3 recovery ancestors (strandied_issue_recovery
 *        originKind), the issue is flagged as a cascade with blocked:cascade label.
 *     2. Rate limit: if a company has >5 recovery issues in 24h, the issue is flagged
 *        as a cascade storm with blocked:cascade label.
 * - All recovery issues (title matching or originKind) are still cancelled on creation.
 * - Cascade recovery issues get an explanatory comment posted before cancellation.
 * - Periodic pruning of the per-company recovery rate tracker.
 *
 * Added in v1.36.0 (AGE-7292 checkout-level dispatch dedup):
 * - Three dispatcher wakeup call sites (issue.created, issue.updated, blocker
 *   auto-promotion) now call shouldDispatchWakeup() before sending the wakeup.
 * - shouldDispatchWakeup() implements two-level dedup:
 *   1. In-memory dedup tracker: skip if a wakeup was already sent for this issue
 *      within 60 seconds (DISPATCH_DEDUP_WINDOW_MS). Prevents concurrent webhooks
 *      from triggering redundant dispatches for the same issue.
 *   2. Execution lock check: skip if the issue already has an active (non-stale)
 *      executionRunId — a live agent run is already handling it.
 * - Periodic pruning of the dispatch dedup tracker (every 60s) prevents memory leaks.
 * - Added "checkout-dedup" to ALERT_DEDUP_COMMENT_TYPES for future dedup tracking.
 * - This complements AGE-7276's stale execution lock sweep (which releases locks
 *   held >30 min) and the concurrent run guard in issue.updated (which skips
 *   plugin processing when an active lock exists). AGE-7292 closes the gap by
 *   preventing the *dispatch* itself from creating redundant runs.
 *
 * Added in v1.35.0 (AGE-8523 agent issue-creation rate limit):
 * - On issue.created: if the creating agent (createdByAgentId) has exceeded the
 *   per-hour issue creation limit, auto-cancel the issue and post an explanatory comment.
 * - Two limits enforced:
 *   1. Max 10 issues/agent/hour (total across all title prefixes)
 *   2. Max 3 issues/agent/hour with the same title prefix (first colon-delimited segment)
 * - Title prefix extraction: the segment before the first colon+space, e.g.
 *   "[gate-check] AGE-123: Verify X" → prefix "[gate-check] AGE-123"
 *   "Recover stalled issue AGE-456" → prefix "Recover stalled issue AGE-456" (no colon → full title)
 *   "[healthd] Mass agent failure — 3 agents" → prefix "[healthd]"
 * - Exempt: human-created issues (createdByUserId, no createdByAgentId)
 * - Exempt: system/healthd issues (createdByAgentId matching healthd agent)
 *   - Healthd agent exemption: agents listed in HEALTHD_AGENT_IDS skip rate limiting
 *     because they report genuine system health events that must not be throttled.
 * - Cancelled issues are cancelled with a deduped comment explaining the rate limit breach.
 * - The rate-limit check runs BEFORE all other issue.created handlers so that
 *   cascade-blocking (auto-dep detection, plan-first demotion, etc.) doesn't fire
 *   for issues that will be immediately cancelled.
 * - Added "rate-limit" to ALERT_DEDUP_COMMENT_TYPES for 24h dedup on cancellation comments.
 *
 * Added in v1.34.0 (AGE-7010 cross-company assignment guard):
 * - Periodic sweep detects active issues assigned to agents from a different company.
 * - Clear the mismatched assignee to stop wasted wake cycles, post alert comment.
 * - Circuit breaker after 3 detections in 30 min for the same issue.
 * - Added "cross-company-assignment" to ALERT_DEDUP_COMMENT_TYPES.
 *
 * Added in v1.34.0 (AGE-7010 cross-company assignment guard):
 * - Periodic sweep detects active issues assigned to agents from a different company.
 * - Clear the mismatched assignee to stop wasted wake cycles, post alert comment.
 * - Circuit breaker after 3 detections in 30 min for the same issue.
 * - Added "cross-company-assignment" to ALERT_DEDUP_COMMENT_TYPES.
 *
 * Added in v1.33.0 (AGE-7550 review gate — in_progress → done interception):
 * - Added "review-gate" to ALERT_DEDUP_COMMENT_TYPES.
 *
 * Added in v1.31.0 (AGE-7284 wake-level dedup — all alert-dedup comment types):
 * - Extended the AGE-7277 verdict-dedup short-circuit to cover ALL [alert-dedup:...]
 *   comment types, not just "verdict-dedup". Root cause: any plugin-generated alert
 *   comment (plan-first-demotion, age278-rejection, cold-queue-recovery, etc.) triggers
 *   PaperClip's issue.updated webhook, which re-enters this handler. The handler can then
 *   generate new comments, which generate new events, creating re-invocation loops.
 *   All [alert-dedup:...] comments are plugin-generated observational flags — by definition
 *   they should not cause the plugin to take additional action. Short-circuiting on any such
 *   comment breaks the loop at its source without affecting legitimate issue transitions.
 * - v1.30.0's check was: `vdfBody.includes("[alert-dedup:verdict-dedup]")` — now generalized
 *   to: `wakeBody.includes("[alert-dedup:")`. Covers all 12 ALERT_DEDUP_COMMENT_TYPES.
 * - Log tag updated from AGE-7277 to AGE-7284 for the generalized check.
 *
 * Added in v1.30.0 (AGE-7277 verdict dedup flag wake loop fix):
 * - Verdict dedup flags (posted by the AGE-6132 handler when a reviewer posts
 *   duplicate verdicts within 1 hour) were triggering PaperClip's comment-based
 *   wake mechanism on the assigned agent, creating infinite loops:
 *   dedup flag → agent wake → agent re-verifies → second verdict → another
 *   dedup flag → another wake → loop.
 * - Fix (two parts):
 *   1. Added "verdict-dedup" to ALERT_DEDUP_COMMENT_TYPES so the 60s/24h dedup
 *      windows actually apply (was missing — isDuplicateAlertComment returned false
 *      immediately for this type).
 *   2. Added early-return suppression in issue.updated: when the latest comment
 *      on an issue contains [alert-dedup:verdict-dedup], the handler short-circuits
 *      before any processing (approval gatekeeper, DCW suppression, verdict dedup
 *      detection, etc.). This prevents the dedup flag comment from generating any
 *      side effects, breaking the wake loop.
 * - VERDICT_DEDUP_FLAG_PREFIX constant added for clear identification.
 *
 * Added in v1.29.0 (AGE-278 system timeout exemption + event amplification dedup):
 * - AGE-278 system timeout exemption: Paperclip's native retry handler times out agent
 *   executions and moves issues to `blocked` without a blocker label. Previously, AGE-278
 *   rejected this → revert → retry → loop (20+ junk comments before storm breaker caught it).
 *   Now detects system-initiated `blocked` transitions via two heuristics:
 *     1. Most recent comment contains "Paperclip automatically retried continuation"
 *     2. Most recent comment has no authorAgentId and no authorUserId (system-generated)
 *   When detected: allows the blocked transition (skips AGE-278 rejection) without adding
 *   a label or reassigning to the orchestrator. The agent picks it up on the next heartbeat.
 *   (AGE-11714: removed blocked:timeout label — it created a deadlock with no API removal path)
 * - `blocked:timeout` is still accepted as a valid blocker label (backward compat for any
 *   pre-existing labeled issues), but is no longer auto-applied by the system.
 * - Event amplification dedup: single status changes were generating 16-36 duplicate handler
 *   invocations within 200ms. The in-memory `alertCommentInflight` Set wasn't sufficient at
 *   this scale. Added a 60-second short-window DB-level dedup check inside
 *   `isDuplicateAlertComment()` that runs BEFORE the existing 24h check. Scans from most
 *   recent comment backward for efficiency. This catches duplicates that slip past the
 *   in-memory guard due to concurrent processing, covering ALL plugin-generated comment types.
 *
 * Added in v1.28.0 (AGE-6845 cold-queue re-queues done routine_execution issues):
 * - DCW handler: extend terminal-status coverage to `cancelled` (previously only `done`).
 *   Cold-queue recovery re-queues both done AND cancelled issues; the handler now suppresses
 *   done→active AND cancelled→active transitions with no recent trigger comment.
 *   Reverts to the correct terminal status (done for done, cancelled for cancelled).
 * - DCW handler: always revert to `previousStatus` (not hardcoded "done") so cancelled
 *   issues are reverted to "cancelled", not incorrectly re-closed as "done".
 * - Continuation-requeue early detection: add terminal-status guard. When the issue
 *   fetched from the API has status=done or status=cancelled, the continuation-requeue
 *   handler now reverts directly to that terminal status instead of applying blocked:external.
 *   Defence-in-depth: handles any edge case where cold-queue recovery fires between the
 *   DCW suppression and the continuation system's blocked transition.
 * - Note: v1.27.1 (below) was the primary regression fix but was not deployed. This
 *   release ships v1.27.1 AND the above additions together as v1.28.0.
 *
 * Added in v1.27.0 (AGE-6132 reviewer close flow — atomicity & recovery):
 * - Reviewer close recovery sweep: periodically scans `in_review` and `blocked:external`
 *   issues that have a reviewer verdict comment (PASS/FAIL) but haven't reached `done`
 *   or `in_progress` (for FAIL). Completes the status transition that was dropped by
 *   transient API failures.
 * - Verdict comment dedup: on issue.updated, when a reviewer posts a verdict comment
 *   (PASS/FAIL/REJECTED), checks if a verdict was already posted by the same reviewer
 *   recently (within 1 hour). If so, the duplicate verdict is flagged but not blocked
 *   (agents own their comments). This prevents the double-post pattern observed on
 *   STU-293 (02:03 and 02:05 UTC).
 * - The sweep runs every 3 minutes and covers all configured companies with a reviewer
 *   agent defined. Circuit breaker: if the same issue is swept 3+ times in 30 min,
 *   posts an escalation comment (24h deduped) routed to the orchestrator.
 *
 * Added in v1.27.1 (AGE-6415 regression fix — KAL-44 cold-queue recovery loop):
 * - The v1.26.1 sweep fix was insufficient: PaperClip clears completedAt when cold-queue
 *   recovery re-queues a done issue, so the sweep's terminal-timestamp check misses it.
 * - The DCW handler (AGE-6126) also fails: cold-queue recovery changes status without adding
 *   a comment, so isTriggerWindow=false → shouldSuppress=false → loop continues.
 * - Fix: in DCW handler, add suppression for done→active with no recent comment in the
 *   trigger window (isTriggerWindow=false or no comments at all). Invariant: legitimate
 *   user reopens always have a recent triggering comment. No-comment reopens = automated.
 *
 * Added in v1.26.1 (AGE-6415 cold-queue recovery defense — cancelled issue gap fix):
 * - The v1.26.0 sweep only checked completedAt, missing cancelled issues that have cancelledAt
 *   but no completedAt. Cold-queue recovery re-queues cancelled issues too, but the sweep
 *   would not detect or revert them. Now checks both fields and reverts to the correct
 *   terminal status (done for completedAt, cancelled for cancelledAt).
 *
 * Added in v1.26.0 (AGE-6413 cold-queue recovery defense):
 * - Periodic sweep of all non-done issues in configured companies. If an active
 *   issue has `completedAt` set (sign it was previously closed), it is reverted
 *   to `done` with a deduped comment. This defends against PaperClip server-side
 *   cold-queue recovery, which re-queues completed issues based on stale
 *   checkout/execution run IDs without checking `status` or `completedAt`.
 * - Defense-in-depth: complements the AGE-6126 deferred_comment_wake suppression
 *   (which catches done→active via `issue.updated` events). Cold-queue recovery
 *   bypasses the event path entirely, so the sweep is the only defense.
 * - Circuit breaker: if the same issue is swept 3+ times in 30 min, posts an
 *   escalation comment (24h deduped) routed to the orchestrator.
 * - Sweep interval: every 2 minutes (covers the cold-queue recovery cadence).
 *
 * Added in v1.25.0 (AGE-6131 stale agent watchdog):
 * - Periodic scan of all agents in configured companies for agents stuck in
 *   status=running with stale lastHeartbeatAt. Resets them to idle so the
 *   dispatcher can re-queue them. Prevents silent dispatch failures when a
 *   gateway restart leaves agent.status pinned to "running".
 * - Initial sweep after 30s, then every 5 minutes.
 *
 * Added in v1.24.0 (AGE-6126 deferred_comment_wake suppression — field name fix):
 * - v1.23.0 used authorId/authorType which don't exist in the Paperclip API response.
 *   The API returns authorAgentId and authorUserId. This rendered the suppression
 *   completely inert — shouldSuppress was always false.
 * - Fixed to use authorAgentId (matches assigneeAgentId) and authorUserId (matches
 *   "local-board"). Also added suppression for null-author system comments.
 * - Added null-author system-comment suppression: Paperclip system comments have
 *   both authorAgentId=null and authorUserId=null; these should never trigger reopens.
 *
 * Added in v1.23.0 (AGE-6126 deferred_comment_wake suppression — initial):
 * - issue.updated: when done → todo/triage/in_progress transition is detected, checks
 *   whether the triggering comment (within 15 min) was authored by the same agent that
 *   closed the issue, or by a local-board proxy. If so, immediately reverts to done,
 *   suppressing the erroneous reopen.
 * - Circuit breaker: if the same issue is suppressed 3+ times in 10 minutes, posts an
 *   escalation comment (24h deduped) routing to the orchestrator for investigation.
 * - Telemetry: ctx.logger.info/warn emitted with structured reason on every
 *   deferred_comment_wake event (suppressed or allowed) for observability.
 * - Fail-open on errors: unexpected exceptions allow the reopen to proceed rather than
 *   silently blocking legitimate post-done activity.
 *
 * Added in v1.22.0 (AGE-6130 gate-check remediation defense-in-depth):
 * - On issue.created: if the creating agent has role=ceo (Juno) AND the new
 *   issue is NOT itself a gate-check (title doesn't start [gate-check]), auto-apply
 *   blocked:needs-approval + create structural_change approval routed to Chris.
 *   This is defense-in-depth: if the tool-level restriction (SOUL.md self-enforcement)
 *   fails or is bypassed, the plugin catches the case and gives Chris a veto.
 * - Also denies the issue going to an implementer without Chris's review.
 *
 * Added in v1.21.0 (AGE-6129 gate-check evidence enforcement):
 * - [gate-check] done transitions now require structured evidence blocks in the final comment.
 *   Evidence block format: `### Criterion N` heading followed by a fenced code block.
 *   If absent, the plugin reverts status to `in_progress` and posts an explanation with the
 *   `gate_check_verify.py` skill command.
 * - Principle: LLM judges evidence, never generates it. Code runs queries, agent reads output.
 * - Fail-open on unexpected errors — legitimate completions are not blocked on plugin errors.
 *
 * Added in v1.19.0 (blocker auto-promotion, cross-company dep scanning, wildcard label rejection):
 * - Blocker dependency auto-promotion: when an issue transitions to `blocked` with valid
 *   `blocked:issue-{IDENTIFIER}` labels, each referenced issue is checked. If the referenced
 *   issue is in `backlog`, it's auto-promoted to `todo` and the dispatcher is woken (if configured).
 *   Prevents blocker issues from sitting idle in backlog while dependent work is stalled.
 * - Cross-company dependency scanning: when an issue reaches `done`, the dependency watcher now
 *   scans ALL configured companies (not just the completing issue's company) for blocked dependents
 *   with matching `blocked:issue-{IDENTIFIER}` labels. Fixes cross-company dependency resolution.
 * - Wildcard blocker label rejection: `blocked:issue-*` and other non-specific blocker labels are
 *
 * Added in v1.20.0 (AGE-6080 dependency-aware auto-unblock):
 * - Multi-blocker check: when a blocker resolves, only remove the resolved `blocked:issue-X` label.
 *   If OTHER blocker labels remain (e.g., `blocked:issue-Z` where Z is still open, or
 *   `blocked:external`), the issue stays in `blocked` status. Previously, any unblock set the
 *   issue to `todo` unconditionally, ignoring remaining blockers.
 * - `blockedBy` relationship support: the dependency watcher now scans both the label model
 *   (`blocked:issue-X` labels) AND the relationship model (`blockedBy` array) for dependents.
 *   The completing issue's `blocks` array is also checked for reverse relationships.
 * - Activity log: an auto-unblock comment is posted on each dependent issue documenting the
 *   event (which blocker resolved, whether fully unblocked or still blocked by other deps).
 *   Actor is clearly identified as the system/engine. *   no longer accepted by AGE-278 validation. Blocker labels must reference a specific issue
 *   identifier (e.g., `blocked:issue-AGE-123`). Wildcard labels can never be auto-resolved.
 *
 * Added in v1.19.0 (AGE-5447 continuation-requeue early detection):
 * - When Paperclip's stranded-issue reconciliation requeues an issue and the
 *   continuation system PATCHes status: "blocked" without a blocker label, AGE-278
 *   now detects this on the FIRST rejection (instead of waiting for 3 rejections).
 * - Detection heuristic: the most recent comment (within 30 min) contains the
 *   Paperclip continuation requeue signature. If detected, auto-apply blocked:external
 *   immediately. This is correct because the continuation system only sets "blocked"
 *   when execution is genuinely unavailable — that IS an external blocker.
 * - Eliminates 2 wasted wake cycles per continuation-requeue event.
 * - Added "continuation-requeue" to ALERT_DEDUP_COMMENT_TYPES for 24h dedup.
 *
 * Added in v1.17.0 (AGE-5123 storm breaker escalation path):
 * - Storm-broken issues are now auto-assigned to the orchestrator (Juno) so they
 *   don't pile up as blocked:external with no owner. Reassignment happens in the
 *   same atomic PATCH as the label/status change. Juno's wakeOnDemand fires on
 *   the assignee change, so he reviews the issue and escalates to Chris if needed.
 * - Comment body updated to call out the Juno assignment when it happens.
 * - Skips reassignment if no orchestrator is configured for the company, or if
 *   the current assignee is already the orchestrator.
 * - Root-cause follow-up (why agents PATCH blocked without a label) tracked in AGE-5447.
 *
 *
 * Architecture (Phase W-2 — Dispatcher Wakeup):
 * REACTIVE ONLY — No drain loop, no self-healing.
 *
 * This plugin handles:
 * 1. Event routing: issue.created / issue.updated events trigger conditional actions
 * 2. Validation rules: blocked status requires structured blocker label (AGE-278)
 * 3. Approval trigger: blocked:needs-approval label → create approval item (Phase 2.2)
 * 4. Approval resolution: approval.resolved → auto-unblock linked issues (Phase 2.3)
 * 5. Assignment routing: in_review → auto-assign Quinn (Phase 0a routing rule)
 * 6. Dependency watching: done → auto-unblock dependent issues (Phase 1.3)
 * 7. Per-company workflow variants: routing-rules.json flags gate each routing rule (Phase 4.5)
 * 8. Auto-dependency detection: issue.created → scan description for "Depends on: AGE-XXX" patterns,
 *    apply blocked:issue-AGE-XXX labels and set status to blocked if deps are open (Phase 4.7)
 * 9. QA rejection circuit breaker: on 3rd reviewer rejection, auto-block with blocked:external
 *    and post escalation comment instead of reassigning to implementer (Phase 4.8 / AGE-318)
 * 10. Dispatcher wakeup (Phase W-2 / AGE-691): for dispatchRequired companies, POST wakeup to
 *     dispatcher when a new or updated unassigned issue lands in todo/backlog
 * 11. Retry storm breaker (AGE-5123/AGE-5168): when AGE-278 validation rejects a blocked transition ≥3 times
 *     within 1 hour, auto-apply blocked:external and allow the transition — breaking auto-retry loops.
 *     Fixes PIX-163-style loops where completed issues are re-woken and auto-blocked without a label.
 *     Suppresses duplicate AGE-278 rejection comments after the first one per storm window.
 *     v1.17.0: Deduplication extended — AGE-278 rejection comments are also suppressed after the first
 *     one within the storm window, even before the threshold is reached. This prevents noise cascades
 *     where every failed retry generates a duplicate rejection comment.
 * 12. Alert dedup (AGE-5261): blocked:external alert comments are deduplicated per 24h window.
 *     Before posting any comment that alerts about a blocked:external issue needing manual action
 *     (OAuth re-auth, token refresh, etc.), check if a similar comment was already posted within
 *     24 hours. Prevents the Granola-style 5x duplicate alert problem across channels.
 *
 * Agent wakeup is delegated entirely to Paperclip native heartbeat:
 * - wakeOnDemand: true — agents wake on assignment
 * - wakeOnDemand: true — agents wake on status changes to assigned work
 * - Heartbeat schedule: per-agent config (typically every 4 hours)
 *
 * Added in v1.15.0 (AGE-5123/AGE-5168 retry storm breaker):
 * - When AGE-278 validation rejects a blocked transition ≥3 times within 1 hour,
 *   auto-apply blocked:external and allow the transition — breaking auto-retry loops.
 * - Fixes PIX-163-style loops where completed issues are re-woken and the
 *   Paperclip auto-continuation system tries to set them to blocked without a label.
 * - Each rejection increments a counter; at threshold, the issue keeper steps in.
 *
 * Added in v1.14.0 (AGE-4962 single atomic PATCH fix):
 * - Reverted two-step PATCH back to single atomic PATCH — server already handles labelIds+status
 *   in a single DB transaction (svc.update commits both before logActivity fires).
 * - The v1.12.2 two-step workaround (labels first, then status) caused infinite loops when
 *   non-plugin code PATCHed {status: "blocked"} without labelIds (e.g., auto-retry):
 *   AGE-278 validation rejects → revert → retry → loop.
 * - Two-step "clear assignee then re-assign" patterns for wakeOnDemand are deliberately kept
 *   (they serve a different purpose: forcing assignee change for wake trigger).
 * - Circuit breaker now uses labelIds (UUIDs) instead of labels (name strings) — API silently drops names.
 *
 * [Historical note — v1.12.2 two-step diagnosis was wrong]:
 * The v1.12.2 changelog claimed "issue.updated handler fires before label write commits."
 * Server code analysis (services/issues.js:update) shows svc.update() runs BOTH the issue row
 * update AND syncIssueLabels() inside a single db.transaction(). logActivity (which fires
 * pluginEventBus.emit) is called AFTER the transaction commits. So ctx.issues.get() in the
 * plugin handler always sees committed labels. The original single-PATCH failure was likely
 * a testing artifact, not a real atomicity gap.
 *
 * Added in v1.12.2 (AGE-306 two-step PATCH fix — SUPERSEDED by v1.14.0):
 * - Reverted auto-dep from single atomic PATCH back to two-step PATCH (Quinn QA proven on AGE-327)
 * - Step 1: PATCH {labelIds} only — AGE-278 validation does not run (newStatus != "blocked")
 * - Step 2: PATCH {status: "blocked"} only — AGE-278 fires, ctx.issues.get() sees committed labels
 * - Atomic single PATCH (v1.12.1) failed: issue.updated handler fires before label write commits
 *
 * Added in v1.12.1 (AGE-306 labelIds fix):
 * - Auto-dep PATCH now uses labelIds (UUIDs) instead of labels (names); API silently drops name strings
 * - ensureBlockerLabel return value collected and passed to PATCH as labelIds
 * - existingLabelIds collected from issue.labels[].id (not names)
 *
 * Added in v1.12.0 (AGE-306 race-condition fix attempt):
 * - Atomic labels+status PATCH in auto-dep detection (was two-step, but this approach also failed)
 * - Validation rule hardened to handle label objects (API returns {id, name} not plain strings)
 *
 * Added in v1.11.0 (Phase 4.8 / AGE-318):
 * - QA rejection circuit breaker: when reviewer sends issue back to in_progress for the 3rd time,
 *   plugin counts reviewer comments containing FAILED/REJECTED and auto-blocks with blocked:external
 *   instead of reassigning to implementer. Posts escalation comment for Chris's queue.
 *
 * Added in v1.10.1 (Phase 4.7 / AGE-306):
 * - Auto-dependency detection on issue.created
 * - Scans description for "Depends on: AGE-XXX", "Depends on AGE-XXX", "**Depends on:** AGE-XXX"
 * - Open deps → apply blocked:issue-AGE-XXX labels + set status to blocked
 * - All done → leave as todo, post informational comment
 * - Comment posted listing all detected dependencies and their status
 *
 * Added in v1.9.0 (Phase 4.5):
 * - Per-company workflow flag support via routing-rules.json
 * - Companies not in routing-rules.json are skipped entirely (no routing rules fire)
 *
 * Added in v1.8.0 (Phase 2.3):
 * - Approval resolution rule: approval.resolved (structural_change) → remove blocked label, set todo
 * - Auto-unblock on approval grant with confirmation comment
 * - Rejection handling with decision note preservation
 *
 * Added in v1.7.0 (Phase 2.2):
 * - Approval trigger rule: blocked:needs-approval → POST /api/companies/{companyId}/approvals
 * - Confirmation comment posted when approval item is created
 *
 * Removed in v1.6.0 (Phase 0a.5 refactor):
 * - COMPANY_AGENTS map (Paperclip manages company membership)
 * - DRAIN_LOOP_EXCLUDE map (no drain loop)
 * - drain-queue job and all cooldown tracking
 * - validateAndFixAgentConfigs() (self-healing moved to separate concern)
 * - maybeInvoke() and hasOpenWork() helpers
 * - Cooldown logic (INVOKE_COOLDOWN_MS, lastInvoked maps, etc.)
 * - Catch-all event listener (debug code)
 */

import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { definePlugin, runWorker } from "@paperclipai/plugin-sdk";

const PAPERCLIP_API =
  process.env.PAPERCLIP_API_URL?.replace(/\/api$/, "") ??
  "http://127.0.0.1:3100";
let PLUGIN_API_KEY = process.env.PAPERCLIP_BOARD_KEY ?? "";
const ROUTING_RULES_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "routing-rules.json",
);

function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> ?? {}),
  };
  if (PLUGIN_API_KEY) headers["Authorization"] = `Bearer ${PLUGIN_API_KEY}`;
  return fetch(url, { ...options, headers });
}

// Phase 4.5: Load routing rules config for per-company workflow variant support.
// If the file is missing or malformed, all workflow flags return false → no routing rules fire.
let routingConfig: { companies: Record<string, any> } = { companies: {} };
try {
  routingConfig = JSON.parse(readFileSync(ROUTING_RULES_PATH, "utf8"));
} catch {
  // Intentionally silent — companies will be treated as unconfigured (routing skipped)
}

/**
 * Returns true if the company has an entry in routing-rules.json.
 * Companies not in the config are skipped — no routing rules fire for them.
 */
function isConfiguredCompany(companyId: string): boolean {
  return !!routingConfig.companies[companyId];
}

/**
 * Returns the agent ID for a given role within a company from routing-rules.json.
 * Returns null if the company or role is not configured.
 */
function getAgentId(
  companyId: string,
  role: "implementer" | "reviewer" | "approver" | "orchestrator" | "dispatcher",
): string | null {
  return routingConfig.companies[companyId]?.agents?.[role] ?? null;
}

/**
 * Ensures a label exists in the company label registry and returns its UUID.
 * The Paperclip PATCH API only accepts labelIds (UUIDs) — name strings are silently ignored.
 * This function creates the label if it doesn't exist, then returns its ID.
 */
async function ensureBlockerLabel(
  companyId: string,
  labelName: string,
): Promise<string | null> {
  // Try to create the label. If it already exists, we'll get an error — that's fine.
  try {
    const res = await apiFetch(
      `${PAPERCLIP_API}/api/companies/${companyId}/labels`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: labelName, color: "#FF6B6B" }),
      },
    );
    if (res.ok) {
      const label = await res.json();
      if (label?.id) return label.id;
    }
  } catch {
    // Network error — fall through to lookup
  }
  // Label already existed or creation response had no id — look it up by name.
  return getLabelId(companyId, labelName);
}

/**
 * Looks up a label by name in the company registry and returns its UUID, or null if not found.
 */
async function getLabelId(
  companyId: string,
  labelName: string,
): Promise<string | null> {
  try {
    const res = await apiFetch(
      `${PAPERCLIP_API}/api/companies/${companyId}/labels`,
    );
    if (!res.ok) return null;
    const data = await res.json();
    const labels: any[] = Array.isArray(data) ? data : (data.labels ?? []);
    const found = labels.find(
      (l: any) => (typeof l === "string" ? l : l.name) === labelName,
    );
    return found?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Resolves an array of label names to their UUIDs in the company registry.
 * Names with no matching label are silently dropped.
 */
async function getLabelIds(
  companyId: string,
  labelNames: string[],
): Promise<string[]> {
  if (labelNames.length === 0) return [];
  try {
    const res = await apiFetch(
      `${PAPERCLIP_API}/api/companies/${companyId}/labels`,
    );
    if (!res.ok) return [];
    const data = await res.json();
    const allLabels: any[] = Array.isArray(data) ? data : (data.labels ?? []);
    const nameSet = new Set(labelNames);
    return allLabels
      .filter((l: any) => nameSet.has(typeof l === "string" ? l : l.name))
      .map((l: any) => l.id)
      .filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Build a self-contained approval description from an issue.
 * The goal: Chris can make an informed decision without leaving the approval screen.
 */
function buildApprovalDescription(issue: any): string {
  const identifier = issue?.identifier ?? "?";
  const title = issue?.title ?? "Unknown";
  const rawDesc = issue?.description ?? "";

  // Extract key sections from the issue description if they exist
  const sections: string[] = [];

  // Extract structured sections from the issue description (see AGENTS.md Approval Description Requirements)
  const sectionPattern = (name: string) =>
    rawDesc.match(
      new RegExp(`##\\s*${name}\\s*\\n([\\s\\S]*?)(?=\\n##|\\n---|$)`, "i"),
    );

  const objectiveMatch = sectionPattern("Objective");
  const contextMatch = sectionPattern("Context");
  const scopeMatch = sectionPattern("Scope");
  const riskMatch = sectionPattern("Risk");
  const implicationsMatch = sectionPattern("Implications");
  const recommendationMatch = rawDesc.match(
    /##\s*Juno'?s?\s*Recommendation\s*\n([\s\S]*?)(?=\n##|\n---|$)/i,
  );
  const rollbackMatch = sectionPattern("Rollback");
  const acceptanceMatch = rawDesc.match(
    /##\s*Acceptance [Cc]riteria\s*\n([\s\S]*?)(?=\n##|\n---|$)/i,
  );

  if (objectiveMatch) {
    sections.push(`What: ${objectiveMatch[1].trim().substring(0, 300)}`);
  } else {
    // Fallback: use first paragraph of description
    const firstPara = rawDesc.split(/\n\n/)[0]?.trim();
    if (firstPara && firstPara.length > 10) {
      sections.push(`What: ${firstPara.substring(0, 300)}`);
    } else {
      sections.push(`What: ${title}`);
    }
  }

  if (contextMatch) {
    sections.push(`Why: ${contextMatch[1].trim().substring(0, 200)}`);
  }

  if (scopeMatch) {
    sections.push(`Scope: ${scopeMatch[1].trim().substring(0, 200)}`);
  }

  if (riskMatch) {
    sections.push(`Risk: ${riskMatch[1].trim().substring(0, 200)}`);
  }

  if (implicationsMatch) {
    sections.push(
      `Implications: ${implicationsMatch[1].trim().substring(0, 300)}`,
    );
  }

  if (recommendationMatch) {
    sections.push(
      `Juno's Recommendation: ${recommendationMatch[1].trim().substring(0, 300)}`,
    );
  }

  if (acceptanceMatch) {
    sections.push(
      `Acceptance criteria: ${acceptanceMatch[1].trim().substring(0, 300)}`,
    );
  }

  if (rollbackMatch) {
    sections.push(`Rollback: ${rollbackMatch[1].trim().substring(0, 300)}`);
  } else {
    sections.push(
      "Rollback: Reject this approval or revert the change after applying.",
    );
  }

  return sections.join("\n\n");
}

/** Statuses that trigger a fresh agent wakeup. */
const TRIGGER_STATUSES = new Set(["todo", "triage", "unstarted"]);

/** Statuses that trigger dispatcher wakeup for dispatchRequired companies (Phase W-2 / AGE-691). */
/**
 * Build a well-formatted markdown comment for an approval item.
 * Posted to /api/approvals/:id/comments so it renders cleanly in the UI
 * below the raw payload JSON. This is the primary thing Chris reads.
 */
function buildApprovalComment(issue: any): string {
  const identifier = issue?.identifier ?? "?";
  const title = issue?.title ?? "Unknown";
  const rawDesc = issue?.description ?? "";

  const sectionPattern = (name: string) =>
    rawDesc.match(
      new RegExp(`##\\s*${name}\\s*\\n([\\s\\S]*?)(?=\\n##|\\n---|$)`, "i"),
    );

  const objectiveMatch = sectionPattern("Objective");
  const contextMatch = sectionPattern("Context");
  const scopeMatch = sectionPattern("Scope");
  const riskMatch = sectionPattern("Risk");
  const implicationsMatch = sectionPattern("Implications");
  const recommendationMatch = rawDesc.match(
    /##\s*Juno'?s?\s*Recommendation\s*\n([\s\S]*?)(?=\n##|\n---|$)/i,
  );
  const rollbackMatch = sectionPattern("Rollback");

  const objective =
    objectiveMatch?.[1]?.trim() || rawDesc.split(/\n\n/)[0]?.trim() || title;
  const context = contextMatch?.[1]?.trim();
  const scope = scopeMatch?.[1]?.trim();
  const risk = riskMatch?.[1]?.trim() || "Not specified";
  const implications = implicationsMatch?.[1]?.trim();
  const recommendation = recommendationMatch?.[1]?.trim();
  const rollback =
    rollbackMatch?.[1]?.trim() ||
    "Reject this approval or revert the change after applying.";

  const lines: string[] = [];
  lines.push(`## ${identifier}: ${title}`);
  lines.push("");
  lines.push(`**What this is:** ${objective.substring(0, 400)}`);
  lines.push("");
  if (context) {
    lines.push(`**Why it's needed:** ${context.substring(0, 300)}`);
    lines.push("");
  }
  if (scope) {
    lines.push(`**What changes:** ${scope.substring(0, 300)}`);
    lines.push("");
  }
  lines.push(`**Risk:** ${risk.substring(0, 200)}`);
  lines.push("");
  if (implications) {
    lines.push(`**If you approve:** ${implications.substring(0, 300)}`);
    lines.push("");
  }
  if (recommendation) {
    lines.push(
      `**Juno's recommendation:** ${recommendation.substring(0, 300)}`,
    );
    lines.push("");
  }
  lines.push(`**How to undo:** ${rollback.substring(0, 300)}`);

  return lines.join("\n");
}

const DISPATCH_WAKEUP_STATUSES = new Set(["todo", "backlog"]);


/**
 * AGE-5261: Alert dedup window for blocked:external comments.
 * Before posting any comment alerting about a blocked:external issue needing manual action
 * (e.g., OAuth re-auth, token refresh), check if a similar comment was already posted
 * within this window. Prevents duplicate alert cascade across agents and channels.
 */
const ALERT_DEDUP_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours
const ALERT_DEDUP_SHORT_WINDOW_MS = 60 * 1000; // 60 seconds — fast-path dedup for event amplification (Bug: 16-36 duplicate handler invocations)
const ALERT_DEDUP_COMMENT_TYPES = [
  "blocked-external", // Generic blocked:external alert
  "circuit-breaker", // QA rejection circuit breaker (AGE-318)
  "approval-gatekeeper", // Approval label enforcement
  "approval-quality", // Approval quality gate
  "continuation-requeue", // Continuation-requeue early detection (AGE-5447)
  "dcw-circuit-breaker", // deferred_comment_wake circuit breaker (AGE-6126)
  "cold-queue-recovery", // Cold-queue recovery suppression (AGE-6413)
  "reviewer-close-recovery", // Reviewer close recovery sweep (AGE-6132)
  "system-timeout", // Paperclip system timeout auto-block
  "verdict-dedup", // Verdict dedup flag (AGE-6132/AGE-7277)
  "stale-execution-lock", // Stale execution lock auto-release (AGE-7276)
  "cross-company-assignment", // Cross-company agent assignment guard (AGE-7010)
  "review-gate", // Review gate interception (AGE-7550)
  "rate-limit", // Agent issue-creation rate limit (AGE-8523)
  "checkout-dedup", // Checkout-level dispatch dedup (AGE-7292)
  "process-adapter-migration-gate", // Process adapter migration script validation (AGE-12141)
  "self-verification-gate", // Self-verification gate for completion claims (AGE-12362)
];

/**
 * AGE-6126: deferred_comment_wake suppression constants.
 * When done → todo/triage/in_progress is detected, the plugin checks if the
 * triggering comment was from the closing agent (or a local-board proxy).
 * If so, it immediately reverts to done and tracks the suppression for the
 * circuit breaker.
 */
const DCW_CIRCUIT_BREAKER_THRESHOLD = 3; // Suppressions within window before escalating
const DCW_CIRCUIT_WINDOW_MS = 10 * 60 * 1000; // 10-minute sliding window
const DCW_COMMENT_TRIGGER_WINDOW_MS = 15 * 60 * 1000; // Max age of triggering comment

/**
 * In-memory per-issue suppression timestamp tracking.
 * Resets on plugin restart (acceptable — short-window circuit breaker).
 * Key: issueId, Value: array of suppression timestamps (ms since epoch).
 */
const dcwSuppressionTracker = new Map<string, number[]>();

/**
 * AGE-6413: Cold-queue recovery defense constants.
 * PaperClip server-side cold-queue recovery re-queues completed issues
 * (done/completedAt set) based on stale checkout/execution run IDs without
 * checking status. This sweep runs every 2 minutes and reverts any active
 * issue that still has completedAt set back to done.
 */
const CQR_SWEEP_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes
const CQR_CIRCUIT_BREAKER_THRESHOLD = 3; // Reverts within window before escalating
const CQR_CIRCUIT_WINDOW_MS = 30 * 60 * 1000; // 30-minute sliding window
const cqrSuppressionTracker = new Map<string, number[]>();

/**
 * AGE-6132: Reviewer close recovery sweep constants.
 * When a reviewer posts a verdict comment (PASS/FAIL) but the status transition
 * to done/in_progress fails (e.g., ECONNREFUSED, gateway timeout), the issue
 * sits stranded in in_review or blocked:external with a verdict already rendered.
 * This sweep detects those cases and completes the close.
 */
const RCR_SWEEP_INTERVAL_MS = 3 * 60 * 1000; // 3 minutes
const RCR_VERDICT_PATTERN =
  /\b(PASS(?:ED|\s*\(conditional\)\b|\b)|FAIL(?:ED|\b)|REJECTED\b)/i;
const RCR_CIRCUIT_BREAKER_THRESHOLD = 3; // Sweeps within window before escalating
const RCR_CIRCUIT_WINDOW_MS = 30 * 60 * 1000; // 30-minute sliding window

/**
 * AGE-7276: Stale execution lock sweep constants.
 * When a PaperClip wake dispatches a run for an issue, the issue gets an
 * executionRunId + executionLockedAt. If the run times out or disappears
 * without completing, the lock remains — preventing subsequent dispatches
 * from proceeding ("Issue run ownership conflict").
 *
 * This sweep scans active issues for stale execution locks (locked > 30 min)
 * and releases them via POST /api/issues/{id}/release so fresh runs can
 * proceed. It also adds a concurrent-run guard in the issue.updated handler
 * that skips plugin processing when an active (non-stale) executionLock exists.
 */
const STALE_EXECUTION_LOCK_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes — max age before lock is auto-released
const STALE_EXECUTION_LOCK_SWEEP_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes
const SEL_CIRCUIT_BREAKER_THRESHOLD = 3; // Releases within window before escalating
const SEL_CIRCUIT_WINDOW_MS = 30 * 60 * 1000; // 30-minute sliding window
const selSweepTracker = new Map<string, number[]>();

/**
 * AGE-7292: Checkout-level dispatch dedup.
 *
 * Prevents redundant dispatcher wakeups for the same issue within a cooldown
 * window. When PaperClip's dispatch layer receives two wakeEventRequests for
 * the same issue in quick succession (e.g., from concurrent webhooks or
 * re-queuing), the second dispatch creates a new run that attempts to
 * checkout an already-owned issue, resulting in "Issue run ownership conflict"
 * errors.
 *
 * This Map tracks the last dispatcher wakeup timestamp per issue ID.
 * If a wakeup was already sent for this issue within DISPATCH_DEDUP_WINDOW_MS,
 * the duplicate is skipped.
 *
 * Additionally, before sending any dispatcher wakeup, we check whether the
 * target issue already has an active (non-stale) executionRunId. If so, the
 * wakeup is skipped because a live agent run is already handling the issue.
 *
 * This complements AGE-7276's stale execution lock sweep (which releases
 * locks held >30 min) and the concurrent run guard in issue.updated (which
 * skips plugin processing when an active lock exists). AGE-7292 closes the
 * gap by preventing the *dispatch* itself from creating redundant runs.
 */
const DISPATCH_DEDUP_WINDOW_MS = 60 * 1000; // 60 seconds — skip redundant wakeups within this window
const dispatchDedupTracker = new Map<string, number>(); // issueId → last wakeup timestamp

/**
 * Per-company orchestrator escalation dedup.
 * When multiple issues hit circuit breakers simultaneously (e.g., on container restart),
 * each would normally post an alert comment that wakes the orchestrator. This tracker
 * limits escalation to once per company per alert type per 30 seconds, preventing
 * burst storms where N simultaneous circuit breakers generate N simultaneous wakeups.
 */
const ORCH_COMPANY_DEDUP_MS = 30 * 1000; // 30 seconds
const orchCompanyDedupTracker = new Map<string, number>(); // `${companyId}:${alertType}` → timestamp

function shouldEscalateToOrchestrator(companyId: string, alertType: string): boolean {
  const key = companyId + ":" + alertType;
  const now = Date.now();
  const last = orchCompanyDedupTracker.get(key);
  if (last !== undefined && now - last < ORCH_COMPANY_DEDUP_MS) return false;
  orchCompanyDedupTracker.set(key, now);
  return true;
}

/**
 * AGE-8523: Agent issue-creation rate limit constants.
 * Limits the number of issues an agent can create per hour to prevent
 * runaway cascades (e.g., 864 "Recover stalled issue" chain during a
 * gateway saturation incident).
 *
 * Two limits:
 *   1. RATE_LIMIT_MAX_ISSUES_PER_HOUR (default 10): total issues per agent per hour
 *   2. RATE_LIMIT_MAX_SAME_PREFIX_PER_HOUR (default 3): issues with the same title
 *      prefix (first colon-delimited segment) per agent per hour
 *
 * Title prefix extraction: segment before the first ": " (colon+space).
 * "[gate-check] AGE-123: Verify X" → "[gate-check] AGE-123"
 * "Recover stalled issue AGE-456" → "Recover stalled issue AGE-456" (no ": ")
 * "[healthd] Mass agent failure" → "[healthd]"
 */
/**
 * AGE-8553: Recovery cascade guard constants.
 * Prevents stranded_issue_recovery cascades from creating hundreds of
 * redundant recovery issues. Three levels of defense:
 *   1. Depth limit: if a recovery issue has >3 recovery ancestors, it's a cascade.
 *   2. Rate limit: max RECOVERY_RATE_LIMIT_PER_COMPANY_PER_24H recovery issues
 *      per company in a 24h window.
 *   3. All recovery issues are cancelled; cascade recovery issues also get
 *      the `blocked:cascade` label for observability.
 */
const RECOVERY_CASCADE_MAX_DEPTH = 3;
const RECOVERY_RATE_LIMIT_PER_COMPANY_PER_24H = 5;
const RECOVERY_RATE_TRACKER = new Map<string, number[]>(); // companyId → sorted timestamps of recovery issues
const RECOVERY_RATE_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

const RATE_LIMIT_MAX_ISSUES_PER_HOUR = 10;
const RATE_LIMIT_MAX_SAME_PREFIX_PER_HOUR = 3;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour sliding window

/**
 * Agent IDs that are exempt from the rate limit.
 * Healthd agents report genuine system health events that must not be throttled.
 * Add other exempt agent IDs here as needed.
 */
const RATE_LIMIT_EXEMPT_AGENT_IDS: string[] = [
  // Healthd agent — reports real system failures, must not be rate-limited
];

/**
 * AGE-7292: Check whether a dispatcher wakeup should proceed for a given issue.
 *
 * Two-level dedup:
 *   1. **In-memory dedup**: If a wakeup was already sent for this issue within
 *      DISPATCH_DEDUP_WINDOW_MS (60s), skip the duplicate. This prevents
 *      concurrent webhooks from triggering redundant dispatches.
 *   2. **Execution lock check**: If the issue already has an active (non-stale)
 *      executionRunId, skip the wakeup — a live agent run is already handling
 *      it. This prevents dispatching a second run when PaperClip's own heartbeat
 *      or the dispatcher has already claimed the issue.
 *
 * Returns true if the wakeup should proceed, false if it should be skipped.
 * When returning false, logs the reason for observability.
 */
async function shouldDispatchWakeup(
  issueId: string,
  companyId: string,
  ctx: any,
): Promise<boolean> {
  const now = Date.now();

  // Level 1: In-memory dedup — skip if a wakeup was sent for this issue recently
  const lastWakeup = dispatchDedupTracker.get(issueId);
  if (lastWakeup && now - lastWakeup < DISPATCH_DEDUP_WINDOW_MS) {
    ctx.logger.info(
      "AGE-7292: Skipping duplicate dispatcher wakeup (dedup window)",
      {
        event: "dispatch_dedup_skip",
        issueId,
        lastWakeupAgo: now - lastWakeup,
        dedupWindowMs: DISPATCH_DEDUP_WINDOW_MS,
      },
    );
    return false;
  }

  // Level 2: Execution lock check — skip if issue has an active run
  try {
    const issue = await ctx.issues.get(issueId, companyId);
    const executionRunId = issue?.executionRunId;
    const executionLockedAt = issue?.executionLockedAt;

    if (executionRunId && executionLockedAt) {
      const lockedTime = new Date(executionLockedAt).getTime();
      const lockAgeMs = now - (Number.isNaN(lockedTime) ? 0 : lockedTime);

      if (lockAgeMs < STALE_EXECUTION_LOCK_THRESHOLD_MS) {
        // Active lock — another run is handling this issue
        ctx.logger.info(
          "AGE-7292: Skipping dispatcher wakeup (active execution lock)",
          {
            event: "dispatch_lock_skip",
            issueId,
            identifier: issue?.identifier,
            executionRunId,
            lockAgeMs,
          },
        );
        return false;
      }
    }
  } catch (err) {
    ctx.logger.warn(
      "AGE-7292: Error checking execution lock — allowing wakeup (fail-open)",
      {
        issueId,
        err: String(err),
      },
    );
  }

  // Record wakeup timestamp for dedup
  dispatchDedupTracker.set(issueId, now);
  return true;
}

/**
 * AGE-7292: Periodically prune the dispatch dedup tracker to prevent memory leaks.
 * Removes entries older than DISPATCH_DEDUP_WINDOW_MS.
 */
function pruneDispatchDedupTracker(): void {
  const now = Date.now();
  for (const [issueId, timestamp] of dispatchDedupTracker) {
    if (now - timestamp >= DISPATCH_DEDUP_WINDOW_MS) {
      dispatchDedupTracker.delete(issueId);
    }
  }
}

function pruneRecoveryRateTracker(): void {
  const cutoff = Date.now() - RECOVERY_RATE_WINDOW_MS;
  for (const [companyId, timestamps] of RECOVERY_RATE_TRACKER) {
    const filtered = timestamps.filter((t) => t >= cutoff);
    if (filtered.length === 0) {
      RECOVERY_RATE_TRACKER.delete(companyId);
    } else {
      RECOVERY_RATE_TRACKER.set(companyId, filtered);
    }
  }
}

/**
 * Extracts the title prefix from an issue title.
 * The prefix is the segment before the first ": " (colon+space) delimiter.
 * If no ": " is found, the full title is used as the prefix.
 */
function extractTitlePrefix(title: string): string {
  const colonSpaceIdx = title.indexOf(": ");
  return colonSpaceIdx === -1 ? title : title.slice(0, colonSpaceIdx);
}

/**
 * AGE-7277: Verdict dedup flag prefix.
 * Verdict dedup flag comments (posted by the AGE-6132 handler) were triggering
 * PaperClip's comment-based wake mechanism on the assigned agent, causing
 * infinite loops: dedup flag → agent wake → agent re-verifies → second verdict →
 * another dedup flag → another wake.
 * This prefix is used to identify dedup flag comments in the issue.updated handler
 * so they can be suppressed from generating side effects.
 */
const VERDICT_DEDUP_FLAG_PREFIX = "**⚠️ Verdict Dedup Flag (AGE-6132)**";
const rcrSweepTracker = new Map<string, number[]>();

/**
 * AGE-6654: In-memory guard for in-flight alert comment posts.
 * Prevents TOCTOU race when multiple webhooks for the same issue arrive within
 * milliseconds — all concurrent isDuplicateAlertComment() calls would query the
 * API before any comment is written, so all return false and post duplicates.
 * This Set is checked synchronously (before any async work) and acts as a mutex.
 * Keys are "issueId:commentType". Cleared after the comment is posted (or skipped).
 */
const alertCommentInflight = new Set<string>();

/**
 * AGE-5261: Check if a comment of the given type was already posted on this issue
 * within the dedup window. Returns true if a duplicate was found (should skip).
 *
 * AGE-6654: Also checks the in-memory inflight guard to prevent TOCTOU races
 * when multiple webhooks fire concurrently for the same issue.
 */
async function isDuplicateAlertComment(
  issueId: string,
  commentType: string,
): Promise<boolean> {
  if (!ALERT_DEDUP_COMMENT_TYPES.includes(commentType)) return false;

  // AGE-6654: Synchronous in-memory guard — if another handler is already posting
  // this comment type for this issue, treat it as a duplicate immediately.
  const inflightKey = `${issueId}:${commentType}`;
  if (alertCommentInflight.has(inflightKey)) return true;
  alertCommentInflight.add(inflightKey);

  try {
    const commentsRes = await apiFetch(
      `${PAPERCLIP_API}/api/issues/${issueId}/comments`,
    );
    if (!commentsRes.ok) return false;
    const comments = await commentsRes.json();
    if (!Array.isArray(comments)) return false;
    const now = Date.now();
    const dedupTag = `[alert-dedup:${commentType}]`;

    // Short-window fast-path (60s): catches duplicates from event amplification
    // where a single status change generates 16-36 identical handler invocations
    // within 200ms. The in-memory guard catches the first concurrent batch, but
    // if comments are written fast enough, subsequent batches slip through.
    // Scanning from the end (most recent) for efficiency.
    for (let i = comments.length - 1; i >= 0; i--) {
      const c = comments[i];
      if (typeof c.body !== "string") continue;
      if (!c.body.includes(dedupTag)) continue;
      const created = new Date(c.createdAt ?? "").getTime();
      if (
        !Number.isNaN(created) &&
        now - created < ALERT_DEDUP_SHORT_WINDOW_MS
      ) {
        // Duplicate within 60s — release the inflight lock
        alertCommentInflight.delete(inflightKey);
        return true;
      }
      // Once we hit a matching comment older than 60s, break out of short-window scan
      // and fall through to the 24h check below
      break;
    }

    // Long-window check (24h): original dedup behavior
    const found = comments.some((c: any) => {
      if (typeof c.body !== "string") return false;
      if (!c.body.includes(dedupTag)) return false;
      const created = new Date(c.createdAt ?? "").getTime();
      return !Number.isNaN(created) && now - created < ALERT_DEDUP_WINDOW_MS;
    });
    if (found) {
      // Already exists in DB — release the inflight lock since we won't post
      alertCommentInflight.delete(inflightKey);
    }
    // If not found, keep the inflight lock — caller will post the comment
    // and must call releaseAlertCommentInflight() after posting
    return found;
  } catch {
    alertCommentInflight.delete(inflightKey);
    return false; // On error, allow the comment through
  }
}

/**
 * AGE-6654: Release the in-flight guard after a comment has been posted (or skipped).
 * Must be called by every code path that got isDuplicateAlertComment() === false.
 */
function releaseAlertCommentInflight(
  issueId: string,
  commentType: string,
): void {
  alertCommentInflight.delete(`${issueId}:${commentType}`);
}

const plugin = definePlugin({
  async setup(ctx) {
    // Load board API key from plugin config (set by operator via admin UI)
    try {
      const config = await ctx.config.get();
      if (config.apiKey && typeof config.apiKey === "string") {
        PLUGIN_API_KEY = config.apiKey;
        ctx.logger.info("Issue Trigger: board API key loaded from config");
      } else if (!PLUGIN_API_KEY) {
        ctx.logger.warn(
          "Issue Trigger: no apiKey in plugin config and PAPERCLIP_BOARD_KEY env not set — API calls will be unauthenticated",
        );
      }
    } catch {
      ctx.logger.warn("Issue Trigger: failed to read plugin config — falling back to env");
    }

    // Log configured companies at startup (AGE-302 acceptance criterion)
    const configuredCompanies = Object.entries(routingConfig.companies).map(
      ([id, cfg]) => `${cfg.name ?? id} (${id})`,
    );
    if (configuredCompanies.length > 0) {
      ctx.logger.info("Issue Trigger: routing rules loaded", {
        configuredCompanies,
      });
    } else {
      ctx.logger.warn(
        "Issue Trigger: no companies configured in routing-rules.json — all routing rules will be skipped",
      );
    }

    // -------------------------------------------------------------------------
    // REACTIVE: issue.created → Paperclip heartbeat handles agent wakeup
    // -------------------------------------------------------------------------
    ctx.events.on("issue.created", async (event: any) => {
      const companyId: string = event?.companyId ?? "";
      const issueId: string = event?.entityId ?? "";
      if (!companyId || !issueId) return;

      // AGE-7010: Cross-company wake event validation.
      // When PaperClip's server dispatches a wake event for an issue in company X
      // to an agent whose API key is scoped to company Y, all API calls fail with
      // "Agent key cannot access another company". This validation catches the
      // mismatch before any API calls are made, preventing wasted cycles.
      // The plugin uses ctx.issues.get() which authenticates with the agent's own API
      // key via the PaperClip plugin SDK. If the issue belongs to a different company,
      // the get() call will fail. We catch this and return early with a warning log.
      let issue: any;
      try {
        issue = await ctx.issues.get(issueId, companyId);
      } catch (err: any) {
        ctx.logger.warn(
          "AGE-7010: issue.created — ctx.issues.get() failed (likely cross-company access denied)",
          {
            companyId,
            issueId,
            err: String(err),
          },
        );
        return;
      }

      // Recovery issue blocker + AGE-8553 cascade guard.
      // All "Recover stalled issue" titled issues are cancelled on creation.
      // Additionally, for PaperClip server-created recovery issues (originKind ===
      // "stranded_issue_recovery"), we enforce:
      //   1. Depth limit: if ancestry chain has > RECOVERY_CASCADE_MAX_DEPTH recovery
      //      ancestors, this is a cascade — add blocked:cascade label for observability.
      //   2. Rate limit: if company has > RECOVERY_RATE_LIMIT_PER_COMPANY_PER_24H recovery
      //      issues in 24h, this is a cascade storm — add blocked:cascade label.
      // Agents should NOT create recovery issues — Reed's dispatch and autoheal handle recovery.
      // (2026-04-28: 524+ cascading recovery issues during WEE gateway saturation incident)
      const issueTitle: string = (issue?.title ?? "").trim();
      const originKind: string = (issue?.originKind ?? "").trim();
      const isRecoveryIssue =
        /^Recover stalled issue\b/i.test(issueTitle) ||
        originKind === "stranded_issue_recovery";
      if (isRecoveryIssue) {
        let isCascade = false;
        let cascadeReason = "";

        // AGE-8553: Check ancestry depth for PaperClip-created recovery issues.
        if (originKind === "stranded_issue_recovery" && issue?.parentId) {
          let depth = 0;
          let currentId: string | null = issue.parentId;
          const visited = new Set<string>();
          for (let i = 0; i < 10 && currentId && !visited.has(currentId); i++) {
            visited.add(currentId);
            try {
              const parentRes = await apiFetch(
                `${PAPERCLIP_API}/api/issues/${currentId}`,
              );
              if (!parentRes.ok) break;
              const parent = await parentRes.json();
              if (parent?.originKind === "stranded_issue_recovery") depth++;
              currentId = parent?.parentId ?? null;
            } catch {
              break; // Can't access parent — stop traversal
            }
          }
          if (depth >= RECOVERY_CASCADE_MAX_DEPTH) {
            isCascade = true;
            cascadeReason = `ancestry depth ${depth} >= ${RECOVERY_CASCADE_MAX_DEPTH}`;
          }
        }

        // AGE-8553: Check per-company recovery rate limit.
        // Prune and track.
        const now = Date.now();
        const companyTimestamps = RECOVERY_RATE_TRACKER.get(companyId) ?? [];
        const recentTimestamps = companyTimestamps.filter(
          (t) => t >= now - RECOVERY_RATE_WINDOW_MS,
        );
        recentTimestamps.push(now);
        RECOVERY_RATE_TRACKER.set(companyId, recentTimestamps);
        if (recentTimestamps.length > RECOVERY_RATE_LIMIT_PER_COMPANY_PER_24H) {
          isCascade = true;
          cascadeReason = cascadeReason
            ? `${cascadeReason}; rate limit ${recentTimestamps.length} > ${RECOVERY_RATE_LIMIT_PER_COMPANY_PER_24H}/24h`
            : `rate limit ${recentTimestamps.length} > ${RECOVERY_RATE_LIMIT_PER_COMPANY_PER_24H}/24h`;
        }

        ctx.logger.warn("Recovery issue blocker: cancelling recovery issue", {
          issueId,
          identifier: issue?.identifier,
          originKind,
          isCascade,
          cascadeReason: cascadeReason || "none",
        });

        const patchBody: any = { status: "cancelled" };
        if (isCascade) {
          // Add blocked:cascade label for observability
          const cascadeLabelId = await ensureBlockerLabel(
            companyId,
            "blocked:cascade",
          );
          if (cascadeLabelId) {
            const existingLabelIds: string[] = (
              issue?.labelIds ??
              issue?.labels ??
              []
            )
              .map((l: any) => (typeof l === "string" ? l : l?.id))
              .filter(Boolean);
            patchBody.labelIds = [
              ...new Set([...existingLabelIds, cascadeLabelId]),
            ];
          }
          // Post a cascade comment for observability
          await apiFetch(`${PAPERCLIP_API}/api/issues/${issueId}/comments`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              body: `**🛑 Recovery Cascade Guard (AGE-8553)**\n\nThis recovery issue was automatically cancelled because it is part of a cascade.\n\n**Reason:** ${cascadeReason}\n**originKind:** ${originKind || "unknown"}\n\nRecovery cascades occur when a failing agent triggers repeated auto-recovery attempts, each of which also fails and triggers another recovery. This guard stops the loop.\n\n[alert-dedup:recovery-cascade-${companyId}]`,
            }),
          });
        }
        await apiFetch(`${PAPERCLIP_API}/api/issues/${issueId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patchBody),
        });
        return;
      }
      // -----------------------------------------------------------------------
      // AGE-8523: Agent issue-creation rate limit.
      // When an agent creates issues too rapidly, auto-cancel the excess and
      // post a deduped explanatory comment. Two limits are enforced:
      //   1. Max RATE_LIMIT_MAX_ISSUES_PER_HOUR issues per agent per hour (total)
      //   2. Max RATE_LIMIT_MAX_SAME_PREFIX_PER_HOUR issues with the same title
      //      prefix per agent per hour
      // Human-created issues (createdByUserId without createdByAgentId) are exempt.
      // Healthd and other exempt agents (RATE_LIMIT_EXEMPT_AGENT_IDS) are exempt.
      // The check runs BEFORE all other handlers so cascade-blocking, plan-first
      // demotion, etc. don't fire for issues that will be immediately cancelled.
      // -----------------------------------------------------------------------
      const createdByAgentId: string | null = issue?.createdByAgentId ?? null;
      // AGE-8523 rate limit check runs before other handlers
      // createdByAgentId is reused below for CEO-approval gate
      if (
        createdByAgentId &&
        !RATE_LIMIT_EXEMPT_AGENT_IDS.includes(createdByAgentId) &&
        isConfiguredCompany(companyId)
      ) {
        try {
          // Fetch all issues created by this agent in the last hour
          const agentIssuesRes = await apiFetch(
            `${PAPERCLIP_API}/api/companies/${companyId}/issues?createdByAgentId=${createdByAgentId}&limit=50&sortBy=createdAt&sortOrder=desc`,
          );
          if (agentIssuesRes.ok) {
            const agentIssuesData = await agentIssuesRes.json();
            const agentIssues: any[] = Array.isArray(agentIssuesData)
              ? agentIssuesData
              : (agentIssuesData.issues ?? []);

            // Filter to issues created within the last hour (API may not support date filtering)
            const recentIssues = agentIssues.filter((i: any) => {
              const created = new Date(i.createdAt ?? "").getTime();
              return (
                !Number.isNaN(created) &&
                created >= Date.now() - RATE_LIMIT_WINDOW_MS
              );
            });

            const totalRecentCount = recentIssues.length;

            // Extract title prefix for the current issue
            const currentTitlePrefix = extractTitlePrefix(issueTitle);

            // Count issues with the same title prefix
            const samePrefixCount = recentIssues.filter(
              (i: any) =>
                extractTitlePrefix((i.title ?? "").trim()) ===
                currentTitlePrefix,
            ).length;

            let rateLimited = false;
            let rateLimitReason = "";

            if (totalRecentCount > RATE_LIMIT_MAX_ISSUES_PER_HOUR) {
              rateLimited = true;
              rateLimitReason = `Total issue creation limit exceeded: ${totalRecentCount} issues in the last hour (max ${RATE_LIMIT_MAX_ISSUES_PER_HOUR})`;
            } else if (samePrefixCount > RATE_LIMIT_MAX_SAME_PREFIX_PER_HOUR) {
              rateLimited = true;
              rateLimitReason = `Same-prefix issue creation limit exceeded: ${samePrefixCount} issues with prefix "${currentTitlePrefix}" in the last hour (max ${RATE_LIMIT_MAX_SAME_PREFIX_PER_HOUR})`;
            }

            if (rateLimited) {
              ctx.logger.warn(
                "AGE-8523: Rate limit exceeded — cancelling issue",
                {
                  issueId,
                  identifier: issue?.identifier,
                  createdByAgentId,
                  totalRecentCount,
                  samePrefixCount,
                  currentTitlePrefix,
                  rateLimitReason,
                },
              );

              // Cancel the issue
              await apiFetch(`${PAPERCLIP_API}/api/issues/${issueId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: "cancelled" }),
              });

              // Post a deduped explanatory comment
              const isDupRateLimit = await isDuplicateAlertComment(
                issueId,
                "rate-limit",
              );
              if (!isDupRateLimit) {
                await apiFetch(`${PAPERCLIP_API}/api/issues/${issueId}/comments`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    body: `**⚠️ Rate Limit: Issue Cancelled (AGE-8523)**\n\nThis issue was automatically cancelled because the creating agent has exceeded the issue-creation rate limit.\n\n**Reason:** ${rateLimitReason}\n\n**Agent:** \`${createdByAgentId}\`\n\nThis is a safety feature to prevent runaway issue cascades. If this is a legitimate bulk operation, please create the issues with a longer delay between each one, or request a rate limit exemption from an administrator.\n\n[alert-dedup:rate-limit]`,
                  }),
                });
                releaseAlertCommentInflight(issueId, "rate-limit");
              }

              ctx.logger.info("AGE-8523: Rate-limited issue cancelled", {
                issueId,
                identifier: issue?.identifier,
                createdByAgentId,
                rateLimitReason,
              });
              return; // Issue cancelled — stop all further processing
            }
          } else {
            ctx.logger.error(
              "AGE-8523: Failed to fetch agent issues for rate limiting",
              {
                issueId,
                createdByAgentId,
                status: agentIssuesRes.status,
              },
            );
            // Fail-open: if we can't check the rate limit, let the issue through
          }
        } catch (rateLimitErr) {
          ctx.logger.error("AGE-8523: Error during rate limit check", {
            issueId,
            createdByAgentId,
            err: String(rateLimitErr),
          });
          // Fail-open: if the rate limit check fails, let the issue through
        }
      }

      // Additional guard: verify the issue's companyId matches what PaperClip sent.
      // This catches edge cases where ctx.issues.get() succeeds but returns data for
      // the wrong company (e.g., if the plugin SDK has broader permissions than expected).
      if (issue?.companyId && issue.companyId !== companyId) {
        ctx.logger.warn(
          "AGE-7010: issue.created — company mismatch between event and issue",
          {
            eventCompanyId: companyId,
            issueCompanyId: issue.companyId,
            issueId,
            identifier: issue?.identifier,
          },
        );
        return;
      }

      const status: string = (issue?.status ?? "").toLowerCase();

      // -----------------------------------------------------------------------
      // Auto-assign unassigned issues on creation (AGE routing hook).
      // Priority: project leadAgentId → company implementer from routing-rules.json.
      // When an unassigned backlog issue is assigned here, promote it to todo so
      // Paperclip's native heartbeat can wake the agent immediately.
      // -----------------------------------------------------------------------
      if (
        !issue.assigneeAgentId &&
        !issue.assigneeUserId &&
        status !== "done" &&
        status !== "cancelled" &&
        isConfiguredCompany(companyId)
      ) {
        let targetAgentId: string | null = null;
        let assignmentSource = "";

        // Agents that only work interactively — never auto-assign to them.
        const AUTO_ASSIGN_EXCLUDED_AGENT_IDS = [
          "2b5f4e67-ca9a-44a2-ac1b-9ec5816d09e8", // Otis (COO — interactive only)
        ];

        // Priority 1: project lead (skip if excluded)
        if (issue.projectId) {
          try {
            const projRes = await apiFetch(
              `${PAPERCLIP_API}/api/projects/${issue.projectId}`,
            );
            if (projRes.ok) {
              const proj = await projRes.json();
              if (proj?.leadAgentId && !AUTO_ASSIGN_EXCLUDED_AGENT_IDS.includes(proj.leadAgentId)) {
                targetAgentId = proj.leadAgentId;
                assignmentSource = "project-lead";
              }
            }
          } catch {
            // fail-open: fall through to company implementer
          }
        }

        // Priority 2: company implementer from routing-rules.json
        if (!targetAgentId) {
          const implementerId = getAgentId(companyId, "implementer");
          if (implementerId) {
            targetAgentId = implementerId;
            assignmentSource = "company-implementer";
          }
        }

        if (targetAgentId) {
          const patchBody: Record<string, unknown> = { assigneeAgentId: targetAgentId };
          if (status === "backlog") patchBody.status = "todo";
          try {
            const patchRes = await apiFetch(`${PAPERCLIP_API}/api/issues/${issueId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(patchBody),
            });
            if (patchRes.ok) {
              ctx.logger.info("Auto-assign: assigned unassigned issue on creation", {
                issueId,
                identifier: issue?.identifier,
                targetAgentId,
                assignmentSource,
                promoted: status === "backlog",
              });
              // Update local copy so downstream handlers see the assignment
              issue = { ...issue, assigneeAgentId: targetAgentId, ...(status === "backlog" ? { status: "todo" } : {}) };
            } else {
              ctx.logger.error("Auto-assign: PATCH failed", {
                issueId,
                identifier: issue?.identifier,
                httpStatus: patchRes.status,
              });
            }
          } catch (err) {
            ctx.logger.error("Auto-assign: error patching issue", {
              issueId,
              identifier: issue?.identifier,
              err: String(err),
            });
          }
        }
      }

      // -----------------------------------------------------------------------
      // Set workMode:planning on new parent tasks so agents plan before acting.
      // Sub-tasks are excluded — they inherit scope from their parent and we
      // don't want planning mode to trigger another round of sub-task creation.
      // -----------------------------------------------------------------------
      if (
        !issue.parentId &&
        status !== "done" &&
        status !== "cancelled" &&
        isConfiguredCompany(companyId) &&
        issue.workMode !== "planning"
      ) {
        try {
          await apiFetch(`${PAPERCLIP_API}/api/issues/${issueId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ workMode: "planning" }),
          });
          ctx.logger.info("Set workMode:planning on new parent issue", {
            issueId,
            identifier: issue?.identifier,
          });
        } catch (err) {
          ctx.logger.error("Failed to set workMode:planning", {
            issueId,
            identifier: issue?.identifier,
            err: String(err),
          });
        }
      }

      // -----------------------------------------------------------------------
      // A.4 [moved here for AGE-12411]: Auto-apply executionPolicy to new issues
      // BEFORE the TRIGGER_STATUSES early-return. Previously A.4 only ran for
      // todo/triage/unstarted issues, which meant CLI-filed `backlog` issues
      // (the recommended pattern for AGE plan-first workflow) and any issue that
      // got plan-first-demoted never received executionPolicy — silently
      // disengaging the entire reviewer/approver lifecycle.
      //
      // Policy is dormant until a `done` transition fires the review-gate, so
      // applying early is safe. Skips [gate] prefix issues and idempotently
      // skips if executionPolicy is already set.
      //
      // Skip done/cancelled — no point applying policy to terminal issues.
      // -----------------------------------------------------------------------
      if (
        status !== "done" &&
        status !== "cancelled" &&
        isConfiguredCompany(companyId) &&
        getAgentId(companyId, "reviewer") !== null &&
        !issue.executionPolicy?.stages?.length
      ) {
        const reviewerAgentId = getAgentId(companyId, "reviewer") as string;
        const approverAgentId = getAgentId(companyId, "approver");

        const stages: object[] = [
          {
            id: randomUUID(),
            type: "review",
            approvalsNeeded: 1,
            participants: [
              { id: randomUUID(), type: "agent", agentId: reviewerAgentId },
            ],
          },
        ];

        if (approverAgentId !== null) {
          stages.push({
            id: randomUUID(),
            type: "approval",
            approvalsNeeded: 1,
            participants: [
              { id: randomUUID(), type: "agent", agentId: approverAgentId },
            ],
          });
        }

        const executionPolicy = {
          mode: "normal",
          commentRequired: true,
          stages,
        };

        try {
          const patchRes = await apiFetch(
            `${PAPERCLIP_API}/api/issues/${issueId}`,
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ executionPolicy }),
            },
          );
          if (patchRes.ok) {
            ctx.logger.info(
              "A.4: Auto-applied executionPolicy to new issue",
              {
                issueId,
                identifier: issue?.identifier,
                status,
                reviewerAgentId,
                approverAgentId,
                companyId,
              },
            );
          } else {
            ctx.logger.error("A.4: Failed to auto-apply executionPolicy", {
              issueId,
              identifier: issue?.identifier,
              status: patchRes.status,
            });
          }
        } catch (err) {
          ctx.logger.error("A.4: Error auto-applying executionPolicy", {
            issueId,
            identifier: issue?.identifier,
            err: String(err),
          });
        }
      }

      if (!TRIGGER_STATUSES.has(status)) return;

      ctx.logger.info("Issue created with actionable status", {
        identifier: issue?.identifier,
        status,
        companyId,
      });

      // -----------------------------------------------------------------------
      // Auto-dependency detection (Phase 4.7 / AGE-306):
      // Scan issue description for "Depends on: AGE-XXX" patterns.
      // Open deps → apply blocked:issue-AGE-XXX labels + set status to blocked.
      // All done → leave as todo, post informational comment.
      // -----------------------------------------------------------------------
      if (isConfiguredCompany(companyId) && issue?.description) {
        const description: string = issue.description;

        // Match all three supported patterns in a single pass:
        // "Depends on: AGE-XXX", "Depends on AGE-XXX", "**Depends on:** AGE-XXX"
        const depRegex =
          /(?:\*\*Depends on:\*\*|Depends on:|Depends on)\s+(AGE-\d+)/gi;
        const rawMatches = [...description.matchAll(depRegex)];
        const identifiers = [
          ...new Set(rawMatches.map((m) => m[1].toUpperCase())),
        ];

        if (identifiers.length > 0) {
          ctx.logger.info("Auto-dep: dependency patterns found in new issue", {
            identifier: issue?.identifier,
            deps: identifiers,
          });

          type DepResult = {
            identifier: string;
            status: string;
            open: boolean;
          };
          const depResults: DepResult[] = [];

          for (const depId of identifiers) {
            try {
              const res = await apiFetch(
                `${PAPERCLIP_API}/api/companies/${companyId}/issues?identifier=${depId}`,
              );
              if (res.ok) {
                const data = await res.json();
                const list: any[] = Array.isArray(data)
                  ? data
                  : (data.issues ?? []);
                const dep = list.find((i: any) => i.identifier === depId);
                if (dep) {
                  const open =
                    dep.status !== "done" && dep.status !== "cancelled";
                  depResults.push({
                    identifier: depId,
                    status: dep.status,
                    open,
                  });
                } else {
                  // Issue not found — treat as open (safe default)
                  depResults.push({
                    identifier: depId,
                    status: "not found",
                    open: true,
                  });
                }
              } else {
                depResults.push({
                  identifier: depId,
                  status: "lookup error",
                  open: true,
                });
              }
            } catch (err) {
              ctx.logger.error("Auto-dep: failed to look up dependency", {
                depId,
                err,
              });
              depResults.push({
                identifier: depId,
                status: "error",
                open: true,
              });
            }
          }

          const openDeps = depResults.filter((d) => d.open);

          if (openDeps.length > 0) {
            // Collect existing label UUIDs (API returns {id, name} objects)
            const existingLabelIds: string[] = (issue.labels ?? [])
              .map((l: any) => (typeof l === "string" ? null : l.id))
              .filter(Boolean);
            const newBlockerLabels = openDeps.map(
              (d) => `blocked:issue-${d.identifier}`,
            );

            try {
              // Ensure each blocked:issue-AGE-XXX label exists and collect UUIDs.
              // The PATCH API only accepts labelIds (UUIDs) — name strings are silently ignored.
              const newLabelIds: string[] = [];
              for (const labelName of newBlockerLabels) {
                const id = await ensureBlockerLabel(companyId, labelName);
                if (id) newLabelIds.push(id);
              }
              const mergedLabelIds = [
                ...new Set([...existingLabelIds, ...newLabelIds]),
              ];

              // Single atomic PATCH (AGE-4962 fix): server handles labelIds+status in a single
              // DB transaction. svc.update() commits both the issue row AND syncIssueLabels()
              // before logActivity/pluginEventBus.emit fires, so ctx.issues.get() in the
              // AGE-278 handler always sees committed labels.
              //
              // The v1.12.2 two-step workaround (labels first, then status) caused infinite loops:
              // any code that PATCHed {status: "blocked"} without labelIds (e.g., auto-retry,
              // manual API call) was repeatedly rejected by AGE-278 → revert → retry → loop.
              await apiFetch(`${PAPERCLIP_API}/api/issues/${issueId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  labelIds: mergedLabelIds,
                  status: "blocked",
                }),
              });
              ctx.logger.info(
                "Auto-dep: issue blocked on open dependencies (single atomic PATCH with labelIds + status)",
                {
                  issueId,
                  identifier: issue?.identifier,
                  labelIds: mergedLabelIds,
                  openDeps: openDeps.map((d) => d.identifier),
                },
              );
            } catch (err) {
              ctx.logger.error(
                "Auto-dep: failed to apply blocked status and labels",
                { issueId, err },
              );
            }
          }

          // Post a comment listing all detected dependencies and their statuses
          const depList = depResults
            .map(
              (d) =>
                `- **${d.identifier}**: \`${d.status}\` ${d.open ? "(open — blocking)" : "(done — no block)"}`,
            )
            .join("\n");
          const commentBody =
            openDeps.length > 0
              ? `**Auto-Dependency Detection — Issue Blocked**\n\nDependencies detected in issue description:\n${depList}\n\nThis issue has been blocked pending resolution of the open dependencies above. It will be automatically unblocked when those issues reach \`done\` status.`
              : `**Auto-Dependency Detection — No Blocking Required**\n\nDependencies detected in issue description:\n${depList}\n\nAll dependencies are already \`done\` — no blocking applied.`;

          try {
            await apiFetch(`${PAPERCLIP_API}/api/issues/${issueId}/comments`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ body: commentBody }),
            });
            ctx.logger.info("Auto-dep: posted dependency detection comment", {
              issueId,
            });
          } catch (err) {
            ctx.logger.error("Auto-dep: failed to post dependency comment", {
              issueId,
              err,
            });
          }
        }
      }

      // A.4 moved earlier in this handler (see AGE-12411). Previously here,
      // it was status-gated by the TRIGGER_STATUSES filter above, which meant
      // CLI-filed `backlog` issues never received executionPolicy.
      // NOTE: Dispatcher wakeup (Phase W-2 / AGE-691) removed — dispatcher role
      // is retired and no companies use it. Paperclip native heartbeat handles wakeup.
    });

    // -------------------------------------------------------------------------
    // REACTIVE: issue.updated → routing & dependency management
    // Agent wakeup handled by Paperclip heartbeat on assignment + status change
    // -------------------------------------------------------------------------
    ctx.events.on("issue.updated", async (event: any) => {
      const companyId: string = event?.companyId ?? "";
      const issueId: string = event?.entityId ?? "";

      if (!companyId || !issueId) return;

      // AGE-7010: Cross-company wake event validation.
      // Same guard as the issue.created handler — prevents the plugin from
      // processing events for companies it doesn't have API access to.
      // This catches the case where PaperClip's dispatch routes a KAL company
      // event to an AGE-scoped plugin instance.
      // We validate companyId early before any API calls are made.
      if (!isConfiguredCompany(companyId)) {
        ctx.logger.info(
          "AGE-7010: issue.updated — event for unconfigured company, skipping",
          {
            companyId,
            issueId,
          },
        );
        // Not an error — the plugin only routes configured companies. But we log
        // it for observability in case cross-company dispatches become frequent.
        // Note: We don't return here because some handlers (like approval resolution)
        // may need to process events for companies not in routing-rules.json.
        // Instead, each handler below checks isConfiguredCompany() independently.
      }

      // Paperclip sends status in event.payload.status (new value) and
      // event.payload._previous.status (old value). The event.changes format
      // was assumed but does not exist in the actual Paperclip event payload.
      const payload = event?.payload ?? {};
      const newStatus: string = (
        payload?.status ?? // Paperclip native format
        event?.changes?.status?.new ?? // legacy/fallback
        payload?.changes?.status?.new ?? // legacy/fallback
        ""
      ).toLowerCase();

      // -----------------------------------------------------------------------
      // AGE-7284: Alert-dedup comment suppression (generalized from AGE-7277).
      // All [alert-dedup:...] comments are plugin-generated observational flags.
      // When one of these comments is the latest on an issue, the issue.updated
      // webhook re-fires, re-entering this handler. If the handler then generates
      // new comments or status changes, another [alert-dedup:...] comment may be
      // posted, creating a re-invocation loop. Because alert-dedup comments are
      // purely observational and require no further plugin action (the plugin
      // already acted in the event cycle that triggered the dedup flag), we
      // short-circuit out of ALL issue.updated processing when one is latest.
      // Covers all 12 ALERT_DEDUP_COMMENT_TYPES (verdict-dedup, age278-rejection,
      // plan-first-demotion, cold-queue-recovery, dcw-circuit-breaker, etc.).
      // -----------------------------------------------------------------------
      if (isConfiguredCompany(companyId)) {
        try {
          const wakeCheckRes = await apiFetch(
            `${PAPERCLIP_API}/api/issues/${issueId}/comments`,
          );
          if (wakeCheckRes.ok) {
            const wakeComments: any[] = (await wakeCheckRes.json()) ?? [];
            if (Array.isArray(wakeComments) && wakeComments.length > 0) {
              // Find the most recent comment and check if it's any alert-dedup flag
              const wakeLatest = wakeComments[wakeComments.length - 1];
              const wakeBody: string =
                typeof wakeLatest?.body === "string" ? wakeLatest.body : "";
              if (wakeBody.includes("[alert-dedup:")) {
                ctx.logger.info(
                  "AGE-7284: alert-dedup comment detected — skipping issue.updated processing to prevent wake loop",
                  {
                    issueId,
                    commentId: wakeLatest?.id,
                    authorAgentId: wakeLatest?.authorAgentId ?? null,
                    authorUserId: wakeLatest?.authorUserId ?? null,
                    dedupTag:
                      wakeBody.match(/\[alert-dedup:[^\]]+\]/)?.[0] ??
                      "unknown",
                  },
                );
                return; // Short-circuit: alert-dedup comments must not trigger further plugin activity
              }
            }
          }
        } catch (err) {
          ctx.logger.warn(
            "AGE-7284: error checking for alert-dedup comment — continuing",
            { issueId, err: String(err) },
          );
        }
      }

      // -----------------------------------------------------------------------
      // AGE-7276: Concurrent run guard.
      // If the issue has an active (non-stale) executionRunId, skip all plugin
      // processing for this event. This prevents the plugin from taking actions
      // (status changes, assignments, comments) that could trigger a new wake
      // dispatch for an issue that already has a live agent run in progress.
      // Stale locks (executionLockedAt > 30 min ago) are NOT guarded here — the
      // sweepStaleExecutionLocks() periodic sweep handles releasing those.
      // -----------------------------------------------------------------------
      if (isConfiguredCompany(companyId)) {
        try {
          const lockIssue = await ctx.issues.get(issueId, companyId);
          const executionRunId = lockIssue?.executionRunId;
          const executionLockedAt = lockIssue?.executionLockedAt;

          if (executionRunId && executionLockedAt) {
            const lockedTime = new Date(executionLockedAt).getTime();
            const lockAgeMs =
              Date.now() - (Number.isNaN(lockedTime) ? 0 : lockedTime);

            if (lockAgeMs < STALE_EXECUTION_LOCK_THRESHOLD_MS) {
              // Active lock — skip most plugin processing to prevent concurrent runs.
              // BUT: still allow the review gate to fire. The review gate intercepts
              // done transitions, which always happen while the lock is held (the agent
              // sets done during its run). Skipping here would bypass review entirely.
              // (AGE-7550 audit: 3 of 5 overnight completions skipped review because
              // the execution lock guard returned before reaching the review gate.)
              if (newStatus !== "done") {
                ctx.logger.info(
                  "AGE-7276: issue has active execution lock — skipping plugin processing to prevent concurrent run",
                  {
                    issueId,
                    identifier: lockIssue?.identifier,
                    executionRunId,
                    lockAgeMs,
                  },
                );
                return;
              }
              ctx.logger.info(
                "AGE-7276: execution lock active but allowing done-transition through for review gate",
                {
                  issueId,
                  identifier: lockIssue?.identifier,
                },
              );
            }
          }
        } catch (err) {
          ctx.logger.warn(
            "AGE-7276: error checking execution lock — continuing",
            { issueId, err: String(err) },
          );
        }
      }

      if (!newStatus) return;

      const previousStatus: string = (
        payload?._previous?.status ?? // Paperclip native format
        event?.changes?.status?.old ?? // legacy/fallback
        "todo"
      ).toLowerCase();

      // -----------------------------------------------------------------------
      // deferred_comment_wake suppression (AGE-6126):
      // Paperclip's deferred_comment_wake scheduler fires when a new comment
      // lands on a done issue, changing status done → todo and waking the
      // assignee. This misidentifies the closing agent's own closure comment
      // as new post-done activity, creating an infinite reopen loop.
      //
      // When we detect done → todo/triage/in_progress:
      //   1. Fetch recent comments. If the latest (within 15 min) was authored
      //      by the assigned agent or a local-board proxy, revert to done.
      //   2. Circuit breaker: after 3 suppressions in 10 min, post escalation
      //      comment to the orchestrator (24h deduped) and still revert.
      //   3. Telemetry: log reason on every done-reopen event (suppressed or not).
      //   4. Fail-open: errors allow the reopen rather than block legit activity.
      // -----------------------------------------------------------------------
      // AGE-6845: extend to cover cancelled→active as well (cold-queue re-queues both).
      const isTerminalReopen =
        (previousStatus === "done" || previousStatus === "cancelled") &&
        (newStatus === "todo" ||
          newStatus === "triage" ||
          newStatus === "unstarted" ||
          newStatus === "in_progress");

      if (isTerminalReopen && isConfiguredCompany(companyId)) {
        // Correct revert target: cancelled issues revert to cancelled, done to done.
        const dcwRevertStatus =
          previousStatus === "cancelled" ? "cancelled" : "done";
        try {
          const issue = await ctx.issues.get(issueId, companyId);
          const assigneeAgentId: string | null = issue?.assigneeAgentId ?? null;

          // Prune stale suppression timestamps from in-memory tracker
          const now = Date.now();
          const existingTs = (dcwSuppressionTracker.get(issueId) ?? []).filter(
            (ts) => now - ts < DCW_CIRCUIT_WINDOW_MS,
          );
          dcwSuppressionTracker.set(issueId, existingTs);
          const recentSuppressions = existingTs.length;

          let shouldSuppress = false;
          let suppressReason = "";

          const commentsRes = await apiFetch(
            `${PAPERCLIP_API}/api/issues/${issueId}/comments`,
          );
          if (commentsRes.ok) {
            const allComments: any[] = (await commentsRes.json()) ?? [];
            if (Array.isArray(allComments) && allComments.length > 0) {
              const latestComment = allComments[allComments.length - 1];
              const commentAge =
                now - new Date(latestComment?.createdAt ?? "").getTime();
              const isTriggerWindow =
                !Number.isNaN(commentAge) &&
                commentAge < DCW_COMMENT_TRIGGER_WINDOW_MS;

              if (isTriggerWindow) {
                // Paperclip API returns authorAgentId (UUID) and authorUserId on comments.
                // Not authorId/authorType — those don't exist in the response.
                const commentAuthorAgentId: string | null =
                  latestComment?.authorAgentId ?? null;
                const commentAuthorUserId: string | null =
                  latestComment?.authorUserId ?? null;

                // Closing agent's own comment triggered the reopen
                if (
                  commentAuthorAgentId != null &&
                  assigneeAgentId != null &&
                  commentAuthorAgentId === assigneeAgentId
                ) {
                  shouldSuppress = true;
                  suppressReason = `closing-agent-comment (authorAgentId=${commentAuthorAgentId}, age=${Math.round(commentAge / 1000)}s)`;
                }
                // local-board proxy echoing agent action
                else if (
                  commentAuthorUserId != null &&
                  commentAuthorUserId.toLowerCase() === "local-board"
                ) {
                  shouldSuppress = true;
                  suppressReason = `local-board-proxy (authorUserId=${commentAuthorUserId})`;
                }
                // System-generated Paperclip comments (no author) should not reopen either
                else if (
                  commentAuthorAgentId === null &&
                  commentAuthorUserId === null
                ) {
                  shouldSuppress = true;
                  suppressReason = `system-comment (no authorAgentId, no authorUserId, age=${Math.round(commentAge / 1000)}s)`;
                }
              } else {
                // AGE-6415 regression fix (v1.27.1): no recent comment in trigger window.
                // Cold-queue recovery changes done→active without adding a comment, so
                // isTriggerWindow is false. The latest comment is whatever was there before
                // (e.g., Juno's manual-close comment from hours earlier).
                // Invariant: a legitimate user reopen always has a recent triggering comment.
                // If done→active fires with no recent comment, it's an automated re-queue.
                shouldSuppress = true;
                suppressReason = `no-comment-reopen (done→${newStatus}, latest comment ${Math.round(commentAge / 1000)}s ago exceeds ${DCW_COMMENT_TRIGGER_WINDOW_MS / 1000}s trigger window — cold-queue recovery, AGE-6415)`;
              }
            } else {
              // No comments on issue at all — also an automated status transition.
              // Cold-queue recovery can re-queue issues that have no comments.
              shouldSuppress = true;
              suppressReason = `no-comment-reopen (done→${newStatus}, no comments on issue — cold-queue recovery, AGE-6415)`;
            }
          }

          ctx.logger.info("deferred_comment_wake: done→reopen detected", {
            issueId,
            identifier: issue?.identifier,
            previousStatus: "done",
            newStatus,
            assigneeAgentId,
            shouldSuppress,
            suppressReason,
            recentSuppressions,
          });

          if (shouldSuppress) {
            // Circuit breaker: escalate to orchestrator if loop is persisting
            if (recentSuppressions >= DCW_CIRCUIT_BREAKER_THRESHOLD) {
              const isDupCircuit = await isDuplicateAlertComment(
                issueId,
                "dcw-circuit-breaker",
              );
              if (!isDupCircuit && shouldEscalateToOrchestrator(companyId, "dcw-circuit-breaker")) {
                const orchestratorId = getAgentId(companyId, "orchestrator");
                await apiFetch(`${PAPERCLIP_API}/api/issues/${issueId}/comments`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    body: `**🔄 deferred_comment_wake Circuit Breaker (AGE-6126)**\n\nThis issue has been auto-suppressed from reopening **${recentSuppressions}+ times in 10 minutes** — the closure loop is persisting beyond normal bounds.\n\n**Issue:** ${issue?.identifier ?? issueId}\n**Assignee agent:** \`${assigneeAgentId ?? "none"}\`\n**Trigger:** ${suppressReason}\n\n${orchestratorId ? "Routing to orchestrator for investigation." : "No orchestrator configured — manual review required."}\n\n[alert-dedup:dcw-circuit-breaker]`,
                  }),
                });
                releaseAlertCommentInflight(issueId, "dcw-circuit-breaker");
                ctx.logger.warn(
                  "deferred_comment_wake circuit breaker: escalated to orchestrator",
                  {
                    issueId,
                    identifier: issue?.identifier,
                    recentSuppressions,
                    orchestratorId: getAgentId(companyId, "orchestrator"),
                  },
                );
              }
            }

            // Revert status to the correct terminal status (AGE-6845: use dcwRevertStatus, not "done").
            await apiFetch(`${PAPERCLIP_API}/api/issues/${issueId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ status: dcwRevertStatus }),
            });

            // Record suppression timestamp for circuit-breaker window
            existingTs.push(now);
            dcwSuppressionTracker.set(issueId, existingTs);

            ctx.logger.info(
              "deferred_comment_wake: suppressed — status reverted to terminal",
              {
                issueId,
                identifier: issue?.identifier,
                suppressReason,
                dcwRevertStatus,
                newRecentSuppressions: existingTs.length,
              },
            );
            return; // Prevent all further processing for this deferred_comment_wake event
          }

          // Reopen not from closing agent — allow through
          ctx.logger.info(
            "deferred_comment_wake: reopen allowed (not from closing agent)",
            {
              issueId,
              identifier: issue?.identifier,
              newStatus,
            },
          );
        } catch (err) {
          ctx.logger.error(
            "deferred_comment_wake suppression: error — failing open to allow reopen",
            {
              issueId,
              err,
            },
          );
          // Fail-open: don't block legitimate post-done activity on unexpected errors
        }
      }

      // -----------------------------------------------------------------------
      // Blocker dependency auto-promotion (v1.19.0):
      // When an issue successfully transitions to blocked with blocked:issue-{IDENTIFIER}
      // labels, check each referenced issue. If the referenced issue is in `backlog`,
      // auto-promote to `todo` and wake the dispatcher (if configured). This prevents
      // blocker issues from sitting idle while dependent work stalls.
      //
      // This fires AFTER AGE-278 validation passes (the code above returns early on
      // rejection). If we reach here with newStatus === "blocked", the labels are valid.
      // -----------------------------------------------------------------------
      if (newStatus === "blocked" && isConfiguredCompany(companyId)) {
        try {
          const issue = await ctx.issues.get(issueId, companyId);
          const labels = issue?.labels ?? [];
          const blockerIdentifiers: string[] = [];
          for (const label of labels) {
            const name =
              typeof label === "string" ? label : (label?.name ?? "");
            if (name.startsWith("blocked:issue-")) {
              const ref = name.slice("blocked:issue-".length);
              if (/^[A-Z]+-\d+$/.test(ref)) {
                blockerIdentifiers.push(ref);
              }
            }
          }

          for (const depIdentifier of blockerIdentifiers) {
            // Determine which company the dependency belongs to by matching prefix
            // to configured company issue prefixes, then look it up.
            let depCompanyId: string | null = null;
            try {
              // Try the current company first (most common case)
              const res = await apiFetch(
                `${PAPERCLIP_API}/api/companies/${companyId}/issues?identifier=${depIdentifier}`,
              );
              if (res.ok) {
                const data = await res.json();
                const list: any[] = Array.isArray(data)
                  ? data
                  : (data.issues ?? []);
                const dep = list.find(
                  (i: any) => i.identifier === depIdentifier,
                );
                if (dep) {
                  depCompanyId = companyId;
                  if (dep.status === "backlog") {
                    // Auto-promote to todo
                    await apiFetch(`${PAPERCLIP_API}/api/issues/${dep.id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ status: "todo" }),
                    });
                    ctx.logger.info(
                      "Blocker auto-promotion: promoted dependency from backlog to todo",
                      {
                        blockedIssue: issue?.identifier,
                        dependency: depIdentifier,
                        depIssueId: dep.id,
                      },
                    );

                    // NOTE: Dispatcher wakeup removed — dispatcher role retired.
                    // Post a comment on the dependency issue explaining why it was promoted
                    await apiFetch(
                      `${PAPERCLIP_API}/api/issues/${dep.id}/comments`,
                      {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          body: `**Auto-Promoted from Backlog → Todo**\n\nThis issue is blocking ${issue?.identifier} (\`blocked:issue-${depIdentifier}\`). Promoted to \`todo\` so it can be dispatched and worked on.`,
                        }),
                      },
                    );
                  }
                }
              }
            } catch (err) {
              ctx.logger.error(
                "Blocker auto-promotion: failed to check/promote dependency",
                {
                  dependency: depIdentifier,
                  err,
                },
              );
            }
          }
        } catch (err) {
          ctx.logger.error(
            "Blocker auto-promotion: failed to process blocked issue labels",
            { issueId, err },
          );
        }
      }

      // -----------------------------------------------------------------------
      // Routing rule (Phase 0a): reviewer rejection → auto-assign implementer
      // When reviewer moves an issue back to in_progress, reassign to implementer.
      // Without this, rejected issues stay assigned to the reviewer forever.
      // Paperclip wakeOnDemand will trigger the implementer's heartbeat on assignment.
      //
      // Circuit breaker (Phase 4.8 / AGE-318): after 3 QA rejections, stop bouncing
      // and escalate to Chris instead of reassigning to the implementer.
      // -----------------------------------------------------------------------
      if (newStatus === "in_progress" && isConfiguredCompany(companyId)) {
        try {
          const issue = await ctx.issues.get(issueId, companyId);
          const reviewerAgentId = getAgentId(companyId, "reviewer");
          if (issue?.assigneeAgentId === reviewerAgentId) {
            // Circuit breaker: count reviewer comments containing FAILED/REJECTED.
            // On the 3rd rejection, block the issue and escalate to Chris.
            let rejectionCount = 0;
            try {
              const commentsRes = await apiFetch(
                `${PAPERCLIP_API}/api/issues/${issueId}/comments`,
              );
              if (commentsRes.ok) {
                const comments = await commentsRes.json();
                rejectionCount = Array.isArray(comments)
                  ? comments.filter(
                      (c: any) =>
                        c.agentId === reviewerAgentId &&
                        /FAILED|REJECTED/i.test(c.body ?? ""),
                    ).length
                  : 0;
              }
            } catch (err) {
              ctx.logger.error(
                "Circuit breaker: comment fetch failed — proceeding with normal reassignment",
                { issueId, err },
              );
            }

            if (rejectionCount >= 3) {
              ctx.logger.info(
                "Circuit breaker: 3 QA rejections detected — escalating to Chris",
                {
                  issueId,
                  identifier: issue?.identifier,
                  rejectionCount,
                },
              );

              // Single atomic PATCH (AGE-4962): use labelIds (UUIDs) + status in one call.
              // Server commits both in the same DB transaction before plugin events fire.
              // Previous two-step PATCH caused infinite AGE-278 rejection loops.
              // Also fixes: labels (name strings) → labelIds (UUIDs) — API silently drops names.
              await ensureBlockerLabel(companyId, "blocked:external");
              const circuitNonBlockedLabelNames: string[] = (issue.labels ?? [])
                .map((l: any) => (typeof l === "string" ? l : l.name))
                .filter((n: string) => !n.startsWith("blocked:"));
              const circuitLabelIds = await getLabelIds(
                companyId,
                circuitNonBlockedLabelNames,
              );
              const externalLabelId = await getLabelId(
                companyId,
                "blocked:external",
              );
              const circuitMergedLabelIds = externalLabelId
                ? [...new Set([...circuitLabelIds, externalLabelId])]
                : circuitLabelIds;

              await apiFetch(`${PAPERCLIP_API}/api/issues/${issueId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  labelIds: circuitMergedLabelIds,
                  status: "blocked",
                }),
              });

              // AGE-5261: dedup circuit breaker comments per 24h window
              const isDupCircuit = await isDuplicateAlertComment(
                issueId,
                "circuit-breaker",
              );
              if (!isDupCircuit) {
                await apiFetch(`${PAPERCLIP_API}/api/issues/${issueId}/comments`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    body: "Circuit breaker: this issue has failed QA 3 times. Escalating to Chris for review. The implementer and reviewer cannot resolve this autonomously.\n\n[alert-dedup:circuit-breaker]",
                  }),
                });
                releaseAlertCommentInflight(issueId, "circuit-breaker");
              } else {
                ctx.logger.info(
                  "Circuit breaker: skipped duplicate circuit-breaker comment (AGE-5261 dedup)",
                  { issueId },
                );
              }

              ctx.logger.info(
                "Circuit breaker: issue blocked with blocked:external, escalation comment posted",
                {
                  issueId,
                  identifier: issue?.identifier,
                },
              );
              return;
            }

            const implementerAgentId = getAgentId(companyId, "implementer");
            ctx.logger.info(
              "Routing rule: reviewer rejection detected — reassigning to implementer",
              {
                issueId,
                identifier: issue?.identifier,
                rejectionCount,
              },
            );
            await apiFetch(`${PAPERCLIP_API}/api/issues/${issueId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ assigneeAgentId: implementerAgentId }),
            });
            ctx.logger.info(
              "Routing rule: assigned implementer to rejected issue",
              { issueId },
            );
            return;
          }
        } catch (err) {
          ctx.logger.error(
            "Routing rule failed: could not reassign rejected issue to implementer",
            { issueId, err },
          );
        }
      }

      // Gate-check evidence enforcement (AGE-6129):
      // When a [gate-check] issue transitions to done, verify that the final comment
      // contains structured evidence blocks (### Criterion N + fenced code block).
      // If absent, revert to in_progress and post an explanation.
      //
      // Principle: LLM should judge evidence, not generate it. Code runs the queries;
      // the agent reads the output. If the agent cannot show evidence, the gate fails.
      // -----------------------------------------------------------------------
      if (newStatus === "done" && isConfiguredCompany(companyId)) {
        try {
          const issue = await ctx.issues.get(issueId, companyId);
          const title: string = (issue?.title ?? "").trim();
          const isGateCheck = /^\[gate-check\]/i.test(title);

          if (isGateCheck) {
            ctx.logger.info(
              "Gate-check evidence enforcement: gate-check done transition detected",
              {
                issueId,
                identifier: issue?.identifier,
              },
            );

            let hasEvidence = false;
            try {
              const commentsRes = await apiFetch(
                `${PAPERCLIP_API}/api/issues/${issueId}/comments`,
              );
              if (commentsRes.ok) {
                const comments = await commentsRes.json();
                if (Array.isArray(comments) && comments.length > 0) {
                  // Check last 3 comments for evidence blocks
                  // Evidence format: ### Criterion N  followed by a fenced code block
                  const recentComments = comments.slice(0, 3);
                  const criterionHeading = /###\s+Criterion\s+\d+/i;
                  const fencedBlock = /```[\s\S]+?```/;
                  for (const comment of recentComments) {
                    const body =
                      typeof comment.body === "string" ? comment.body : "";
                    if (criterionHeading.test(body) && fencedBlock.test(body)) {
                      hasEvidence = true;
                      break;
                    }
                  }
                }
              }
            } catch (err) {
              ctx.logger.error(
                "Gate-check evidence enforcement: error fetching comments",
                { issueId, err },
              );
              // Fail-open — if we can't check, allow through
              hasEvidence = true;
            }

            if (!hasEvidence) {
              // Revert to in_progress
              await apiFetch(`${PAPERCLIP_API}/api/issues/${issueId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: "in_progress" }),
              });

              await apiFetch(`${PAPERCLIP_API}/api/issues/${issueId}/comments`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  body: `**🔍 Gate-Check Evidence Required (AGE-6129)**

This \`[gate-check]\` issue was transitioned to \`done\` without structured evidence blocks in the final comment. Status reverted to \`in_progress\`.

**Required format** — each acceptance criterion needs a \`### Criterion N\` section followed by a fenced code block with actual query output:

\`\`\`markdown
### Criterion 1: <criterion text>

\\\`\\\`\\\`
<verification command>
\\\`\\\`\\\`

\\\`\\\`\\\`evidence
<raw command output>
\\\`\\\`\\\`

**Status**: PASS — <brief explanation>
\`\`\`

**Generate evidence automatically:**
\`\`\`
python3 /Users/openclaw/.openclaw/workspace/skills/gate-check-verify/gate_check_verify.py --issue ${issue?.identifier}
\`\`\`

**Rule (AGE-6129):** LLM must judge evidence, not generate it. The skill runs queries deterministically; Juno reads the output and marks each criterion PASS/FAIL/ERROR.`,
                }),
              });

              ctx.logger.warn(
                "Gate-check evidence enforcement: rejected done — no evidence blocks found, reverted to in_progress",
                {
                  issueId,
                  identifier: issue?.identifier,
                },
              );
              return; // Stop — do NOT run dependency watcher on a reverted issue
            }

            ctx.logger.info(
              "Gate-check evidence enforcement: evidence blocks present — allowing done transition",
              {
                issueId,
                identifier: issue?.identifier,
              },
            );
          }
        } catch (err) {
          ctx.logger.error(
            "Gate-check evidence enforcement: error — allowing done through",
            { issueId, err },
          );
          // Fail-open — don't block legitimate completions on unexpected errors
        }
      }

      /**
       * AGE-12362: Self-verification gate helper functions
       * Extract and verify completion claims from issue comments
       */

      interface VerificationFailure {
        claim: string;
        type: "file" | "git" | "pr" | "http" | "process" | "branch";
        reason: string;
      }

      async function extractClaimsFromComment(
        body: string,
      ): Promise<Array<{ claim: string; type: string }>> {
        const claims: Array<{ claim: string; type: string }> = [];

        // File paths: "created file /path/to/file" or similar
        const filePaths = body.match(
          /(?:created|wrote|added|modified)\s+(?:file\s+)?([/\w.\-]+\.\w+)/gi,
        );
        if (filePaths) {
          for (const match of filePaths) {
            const pathMatch = match.match(/([/\w.\-]+\.\w+)/);
            if (pathMatch) {
              claims.push({ claim: pathMatch[1], type: "file" });
            }
          }
        }

        // Git commits: "committed abc1234 to" or "pushed abc1234"
        const commits = body.match(/(?:committed|pushed)\s+([a-f0-9]{6,40})/gi);
        if (commits) {
          for (const match of commits) {
            const shaMatch = match.match(/([a-f0-9]{6,40})/);
            if (shaMatch) claims.push({ claim: shaMatch[0], type: "git" });
          }
        }

        // AGE-13521: Explicit "**Commit:** sha" or "Commit: sha" pattern used by agents
        // in completion comments, e.g. "**Commit:** 92284338 ..."
        const commitLabels = body.matchAll(
          /\*{0,2}[Cc]ommit:?\*{0,2}\s*`?([a-f0-9]{6,40})`?/g,
        );
        for (const m of commitLabels) {
          if (m[1]) claims.push({ claim: m[1], type: "git" });
        }

        // AGE-13521: GitHub PR URLs — full URL with org/repo/number allows precise verification
        // e.g. https://github.com/chrisabad/openclaw-llm-proxy/pull/42
        const prUrls = body.match(
          /https:\/\/github\.com\/[\w\-]+\/[\w\-]+\/pull\/\d+/g,
        );
        if (prUrls) {
          for (const url of prUrls) {
            // Deduplicate
            if (
              !claims.some((c) => c.claim === url && c.type === "github_pr")
            ) {
              claims.push({ claim: url, type: "github_pr" });
            }
          }
        }

        // AGE-13521: Branch names from "**Branch:** feat/something" pattern.
        // Agents commonly use this exact format in completion comments.
        // Only extract names containing '/' (e.g. feat/X, fix/Y) to avoid matching
        // bare words like "main" or "master" which are too broad to verify.
        const branchMatches = body.matchAll(
          /\*{0,2}[Bb]ranch:?\*{0,2}\s*`?([^\s`\n]+\/[^\s`\n]+)`?/g,
        );
        for (const m of branchMatches) {
          const branchName = m[1]?.trim();
          if (branchName && branchName.length > 1) {
            if (
              !claims.some((c) => c.claim === branchName && c.type === "branch")
            ) {
              claims.push({ claim: branchName, type: "branch" });
            }
          }
        }

        return claims;
      }

      async function verifyFilePath(
        path: string,
      ): Promise<VerificationFailure | null> {
        try {
          const { execSync } = require("node:child_process");
          execSync(`test -e "${path}"`, { stdio: "pipe" });
          return null; // Exists
        } catch {
          return {
            claim: path,
            type: "file",
            reason: "File not found (test -e failed)",
          };
        }
      }

      async function verifyGitCommit(
        sha: string,
      ): Promise<VerificationFailure | null> {
        try {
          const { execSync } = require("node:child_process");
          const repoRoot = `${process.env.HOME}/.openclaw`;
          execSync(
            `git -C "${repoRoot}" log --oneline origin/main | grep "${sha}"`,
            {
              stdio: "pipe",
              shell: "/bin/bash",
            },
          );
          return null; // Found on origin/main
        } catch {
          return {
            claim: sha,
            type: "git",
            reason: "Commit not found on origin/main",
          };
        }
      }

      /**
       * AGE-13521: Verify a GitHub PR URL exists.
       * Parses owner/repo/number from the URL, then calls the GitHub API.
       * Fail-open on infrastructure errors (network, auth) — only block when
       * the GitHub API explicitly returns 404 for the PR.
       */
      async function verifyGitHubPR(
        prUrl: string,
      ): Promise<VerificationFailure | null> {
        try {
          const { execSync } = require("node:child_process");
          const match = prUrl.match(
            /github\.com\/([\w\-]+)\/([\w\-]+)\/pull\/(\d+)/,
          );
          if (!match) {
            // Malformed URL — can't verify, fail-open
            return null;
          }
          const [, owner, repo, number] = match;
          execSync(
            `gh api "repos/${owner}/${repo}/pulls/${number}" --jq '.number' 2>/dev/null`,
            { stdio: "pipe", timeout: 30000 },
          );
          return null; // PR exists
        } catch (err: any) {
          const msg = String(
            err?.stderr ?? err?.stdout ?? err?.message ?? "",
          ).toLowerCase();
          if (
            msg.includes("not found") ||
            msg.includes("404") ||
            msg.includes("no pull request")
          ) {
            return {
              claim: prUrl,
              type: "pr",
              reason: "PR not found on GitHub (404)",
            };
          }
          // Auth errors, network errors, etc — fail-open
          return null;
        }
      }

      /**
       * AGE-13521: Verify a branch name exists in at least one of the known AGE repos.
       * Checks the hint repos first (derived from PR URL context), then falls back
       * to the full known-repos list. Fail-open on infrastructure errors.
       */
      async function verifyBranchName(
        branchName: string,
        repoHints: string[],
      ): Promise<VerificationFailure | null> {
        const { execSync } = require("node:child_process");

        const KNOWN_REPOS = [
          "openclaw",
          "openclaw-llm-proxy",
          "paperclip-issue-trigger",
          "agentos-config",
          "paperclip",
          "agentos-services",
          "agentos-docs",
        ];

        // Build deduped ordered list: hints first, then known repos
        const checkedSlugs = new Set<string>();
        const reposToCheck: string[] = [];
        for (const hint of repoHints) {
          const slug = hint.includes("/") ? hint : `chrisabad/${hint}`;
          if (!checkedSlugs.has(slug)) {
            checkedSlugs.add(slug);
            reposToCheck.push(slug);
          }
        }
        for (const r of KNOWN_REPOS) {
          const slug = `chrisabad/${r}`;
          if (!checkedSlugs.has(slug)) {
            checkedSlugs.add(slug);
            reposToCheck.push(slug);
          }
        }

        for (const repo of reposToCheck) {
          try {
            // GET /repos/{owner}/{repo}/branches/{branch}
            // Branch names with slashes (feat/X) are valid in the URL path.
            execSync(
              `gh api "repos/${repo}/branches/${branchName}" --jq '.name' 2>/dev/null`,
              { stdio: "pipe", timeout: 20000 },
            );
            return null; // Branch found
          } catch (err: any) {
            const msg = String(
              err?.stderr ?? err?.stdout ?? err?.message ?? "",
            ).toLowerCase();
            if (
              msg.includes("could not resolve host") ||
              msg.includes("authentication token") ||
              msg.includes("bad credentials")
            ) {
              // Infrastructure error — fail-open immediately
              return null;
            }
            // "Not Found" / 404 — branch not in this repo, try next
          }
        }

        // Not found in any repo
        return {
          claim: branchName,
          type: "branch",
          reason: "Branch not found in any known AGE repo",
        };
      }

      async function verifyCompletion(
        failures: VerificationFailure[],
      ): Promise<boolean> {
        return failures.length === 0;
      }

      // -----------------------------------------------------------------------
      // AGE-12141: Process-adapter migration gate — committed-script validation
      // When an issue transitions to done and references a Process-adapter migration,
      // validate that all referenced scripts are committed to git. Prevents silent
      // failures when agents migrate crons to Process routines without committing
      // the scripts, only to have them deleted by runtime cleanup.
      //
      // Detects Process migrations by:
      //   - Title contains "Process" + "routine" or "Migrate"
      //   - Description mentions "adapterType: process" or "Process routine"
      //   - References to AGE-11126, AGE-11127, AGE-11128, AGE-11258 (known migrations)
      //
      // Validates scripts by:
      //   - Extracting file paths like `tools/*.py` from description
      //   - Running `git ls-tree HEAD <path>` to check if committed
      //   - Allowing override: if description contains "[runtime-only]" with rationale
      // -----------------------------------------------------------------------
      if (newStatus === "done" && isConfiguredCompany(companyId)) {
        try {
          const issue = await ctx.issues.get(issueId, companyId);
          const title: string = (issue?.title ?? "").trim();
          const description: string = (issue?.description ?? "").trim();

          // Detect Process-adapter migration patterns
          const isMigration =
            /Process.*routine|Migrate.*cron|Migrate.*[Pp]rocess/i.test(title) ||
            /adapterType:\s*process|Process routine|process.*adapter/i.test(
              description,
            ) ||
            /AGE-(11126|11127|11128|11258|12139|12140)/i.test(description);

          if (isMigration) {
            ctx.logger.info(
              "AGE-12141: Process-adapter migration detected — validating committed scripts",
              {
                issueId,
                identifier: issue?.identifier,
                title,
              },
            );

            // Check for runtime-only override: [runtime-only] followed by substantial text
            const runtimeOnlyMatch = description.match(
              /\[runtime-only\]([\s\S]*?)(?:\n\n|$)/i,
            );
            const hasRuntimeOnlyAck =
              runtimeOnlyMatch && runtimeOnlyMatch[1]?.trim().length > 20;

            if (hasRuntimeOnlyAck) {
              ctx.logger.info(
                "AGE-12141: Runtime-only override found — allowing transition",
                {
                  issueId,
                  identifier: issue?.identifier,
                },
              );
            } else {
              // Extract script paths from description (tools/*.py, scripts/*.sh, etc.)
              const scriptPathRegex =
                /(?:tools\/|scripts\/|\.\/)[^\s\)]+\.(?:py|sh|js|mjs|ts)/gi;
              const scriptPaths = Array.from(
                description.matchAll(scriptPathRegex),
              ).map((m) => m[0]);

              if (scriptPaths.length > 0) {
                const uncommittedScripts: string[] = [];

                // Check across both canonical repos that hold scheduled scripts:
                // ~/.openclaw (agentos-config production tree) is the primary canonical
                // home; ~/.openclaw/workspace (juno-backup, being deprecated under
                // AGE-12323) is the legacy location. A script is considered committed
                // if it's tracked in either tree.
                const REPO_ROOTS = [
                  `${process.env.HOME}/.openclaw`,
                  `${process.env.HOME}/.openclaw/workspace`,
                ];

                for (const scriptPath of scriptPaths) {
                  let foundInAnyRepo = false;
                  let lastError: unknown = null;

                  for (const repoRoot of REPO_ROOTS) {
                    try {
                      const gitOutput = execSync(
                        `git -C "${repoRoot}" ls-tree HEAD -- "${scriptPath}" 2>/dev/null || true`,
                        {
                          encoding: "utf-8",
                          stdio: ["pipe", "pipe", "pipe"],
                        },
                      ).trim();
                      if (gitOutput) {
                        foundInAnyRepo = true;
                        break;
                      }
                    } catch (err) {
                      lastError = err;
                      // Try next repo
                    }
                  }

                  if (!foundInAnyRepo) {
                    if (lastError) {
                      ctx.logger.warn(
                        "AGE-12141: Could not check git status for script",
                        {
                          scriptPath,
                          err: String(lastError),
                        },
                      );
                      // Fail-open: if we couldn't verify in ANY repo, allow through
                      continue;
                    }
                    uncommittedScripts.push(scriptPath);
                  }
                }

                if (uncommittedScripts.length > 0) {
                  // Block the transition
                  await apiFetch(`${PAPERCLIP_API}/api/issues/${issueId}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ status: "in_progress" }),
                  });

                  const commentBody = `**🔒 Process Adapter Migration Gate (AGE-12141)**

This issue transitions a cron to a Process routine but references uncommitted scripts. Status reverted to \`in_progress\`.

**Uncommitted scripts:**
${uncommittedScripts.map((s) => `- \`${s}\``).join("\n")}

**Resolution:**
Either:
1. **Commit the scripts to git** and mark the issue done again, OR
2. **Add \`[runtime-only]\`** to your issue description with a rationale (5+ words) if these scripts are intentionally runtime-only

Rationale: Process routine migrations that depend on uncommitted scripts fail silently when runtime cleanup removes the script from the agent's working tree. This gate prevents that class of failure.

See AGE-12102 for context.

[alert-dedup:process-adapter-migration-gate]`;

                  await apiFetch(
                    `${PAPERCLIP_API}/api/issues/${issueId}/comments`,
                    {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        body: commentBody,
                      }),
                    },
                  );

                  ctx.logger.info(
                    "AGE-12141: Blocked done transition — uncommitted scripts",
                    {
                      issueId,
                      identifier: issue?.identifier,
                      uncommittedScripts,
                    },
                  );
                  return; // Stop — do NOT run dependency watcher on a blocked issue
                }
              }
            }
          }
        } catch (err) {
          ctx.logger.error(
            "AGE-12141: Process-adapter migration gate error — allowing done through",
            { issueId, err: String(err) },
          );
          // Fail-open — don't block legitimate completions on gate errors
        }
      }

      // -----------------------------------------------------------------------
      // AGE-12362: Self-verification gate — validate completion claims
      //
      // When an AGE engineer marks an issue done, they implicitly make claims
      // about what was completed (files created, commits pushed, etc). This gate
      // extracts those claims from the final comment and verifies them.
      //
      // Detects:
      //   - File paths: "created file /path/to/file"
      //   - Git commits: "committed abc1234" or "pushed"
      //   - PR merges: "merged PR #123"
      //
      // Verification runs in parallel with 30s timeout per check.
      // If any check fails, reverts to in_progress with detailed comment.
      // Fail-open on infrastructure errors (don't block on network failures).
      // -----------------------------------------------------------------------
      if (newStatus === "done" && isConfiguredCompany(companyId)) {
        try {
          const issueData = await ctx.issues.get(issueId, companyId);

          // Fetch the issue's comments
          let comments: any[] = [];
          try {
            const commentsRes = await apiFetch(
              `${PAPERCLIP_API}/api/issues/${issueId}/comments`,
            );
            if (commentsRes.ok) {
              comments = await commentsRes.json();
            }
          } catch (err) {
            ctx.logger.warn(
              "AGE-12362: Could not fetch comments — skipping verification",
              {
                issueId,
                err: String(err),
              },
            );
          }

          // Get the most recent non-system comment.
          // Paperclip comments API returns oldest-first, so iterate in reverse
          // to find the LATEST non-system comment (the agent's completion comment).
          // AGE-12421: prior implementation iterated forward and grabbed the
          // OLDEST comment — usually had no verifiable claims, so the gate
          // silently fail-opened on every issue.
          let lastComment: string | null = null;
          if (Array.isArray(comments) && comments.length > 0) {
            for (let i = comments.length - 1; i >= 0; i--) {
              const c = comments[i];
              if (typeof c?.body === "string" && !c.body.includes("[system:")) {
                lastComment = c.body;
                break;
              }
            }
          }
          ctx.logger.info("AGE-12362: Self-verify gate — selected comment", {
            issueId,
            commentLength: lastComment ? lastComment.length : 0,
            totalComments: Array.isArray(comments) ? comments.length : 0,
          });

          if (lastComment) {
            // Extract claims from the comment
            const claims = await extractClaimsFromComment(lastComment);

            if (claims.length > 0) {
              ctx.logger.info(
                "AGE-12362: Self-verification gate — checking completion claims",
                {
                  issueId,
                  identifier: issueData?.identifier,
                  claimCount: claims.length,
                },
              );

              // AGE-13521: Pre-compute repo hints from PR URL claims so branch
              // checks can prioritize the right repo without iterating all of them.
              const repoHintsFromPRs: string[] = [];
              for (const c of claims) {
                if (c.type === "github_pr") {
                  const m = c.claim.match(
                    /github\.com\/[\w\-]+\/([\w\-]+)\/pull/,
                  );
                  if (m?.[1] && !repoHintsFromPRs.includes(m[1])) {
                    repoHintsFromPRs.push(m[1]);
                  }
                }
              }

              // Run verification checks in parallel
              const failures: VerificationFailure[] = [];
              const checks = claims.map(async (claim) => {
                try {
                  if (claim.type === "file") {
                    const failure = await verifyFilePath(claim.claim);
                    if (failure) failures.push(failure);
                  } else if (claim.type === "git") {
                    const failure = await verifyGitCommit(claim.claim);
                    if (failure) failures.push(failure);
                  } else if (claim.type === "github_pr") {
                    // AGE-13521: Verify GitHub PR URL exists
                    const failure = await verifyGitHubPR(claim.claim);
                    if (failure) failures.push(failure);
                  } else if (claim.type === "branch") {
                    // AGE-13521: Verify branch exists in at least one known repo
                    const failure = await verifyBranchName(
                      claim.claim,
                      repoHintsFromPRs,
                    );
                    if (failure) failures.push(failure);
                  }
                  // HTTP checks require more infrastructure; skip for now
                } catch (err) {
                  ctx.logger.warn("AGE-12362: Verification check error", {
                    claim: claim.claim,
                    type: claim.type,
                    err: String(err),
                  });
                  // Fail-open: don't block on verification errors
                }
              });

              await Promise.all(checks);

              if (failures.length > 0) {
                // Revert to in_progress
                await apiFetch(`${PAPERCLIP_API}/api/issues/${issueId}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ status: "in_progress" }),
                });

                const failuresList = failures
                  .map((f) => `- ❌ ${f.claim} (${f.type}): ${f.reason}`)
                  .join("\n");

                const commentBody = `**⚠️ Self-Verification Failed (AGE-12362)**

This issue was about to transition to \`done\`, but verification of your completion claims failed. Status has been reverted to \`in_progress\`.

**Failed verifications:**
${failuresList}

**Resolution:**
1. Verify the claims in your completion comment
2. Ensure all claimed work has been completed (files exist, commits are pushed)
3. Update the issue when work is ready
4. Mark done again

This gate prevents false-done transitions by validating claimed work exists.

[alert-dedup:self-verification-gate]`;

                await apiFetch(`${PAPERCLIP_API}/api/issues/${issueId}/comments`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ body: commentBody }),
                });

                ctx.logger.info(
                  "AGE-12362: Blocked done transition — verification failed",
                  {
                    issueId,
                    identifier: issueData?.identifier,
                    failureCount: failures.length,
                  },
                );
                return; // Stop — do NOT run dependency watcher
              }
            }
          }
        } catch (err) {
          ctx.logger.error(
            "AGE-12362: Self-verification gate error — allowing done through",
            { issueId, err: String(err) },
          );
          // Fail-open
        }
      }

      // -----------------------------------------------------------------------
      // Dependency watcher (Phase 1.3 / v1.19.0 / v1.20.0 AGE-6080): done → auto-unblock dependent issues
      //
      // v1.19.0: Scans ALL configured companies for blocked dependents, not just the
      // completing issue's company. Handles cross-company dependencies.
      //
      // v1.20.0 (AGE-6080): Multi-blocker awareness — when a blocker resolves, only
      // the resolved `blocked:issue-X` label is removed. If OTHER blocker labels remain
      // (e.g., `blocked:issue-Z` where Z is still open, or `blocked:external`), the
      // dependent issue stays in `blocked` status. Also checks `blockedBy` relationship
      // array and `blocks` array on the completing issue. Posts an auto-unblock comment
      // on each dependent issue documenting the event.
      // -----------------------------------------------------------------------
      if (newStatus === "done" && isConfiguredCompany(companyId)) {
        let issue: any;
        try {
          issue = await ctx.issues.get(issueId, companyId);
        } catch {
          return;
        }

        ctx.logger.info(
          "Dependency watcher: issue reached done — scanning all companies for blocked dependents",
          {
            issueId,
            identifier: issue?.identifier,
          },
        );

        const blockingLabel = `blocked:issue-${issue?.identifier}`;
        const blockingIssueId = issue?.id;
        const blockingIdentifier = issue?.identifier;
        const companyIds = Object.keys(routingConfig.companies);

        // Collect blockedBy identifiers from the relationship model
        const blockedByIdentifiers: string[] = Array.isArray(issue?.blockedBy)
          ? issue.blockedBy.filter((id: any) => typeof id === "string")
          : [];

        // Collect identifiers from the blocks array (reverse relationship)
        const blocksIdentifiers: string[] = Array.isArray(issue?.blocks)
          ? issue.blocks.filter((id: any) => typeof id === "string")
          : [];

        // Derive blocking labels from relationship model for matching
        const blockingLabelsFromRelationships: string[] = [
          ...blockedByIdentifiers.map((id: string) => `blocked:issue-${id}`),
          ...blocksIdentifiers.map((id: string) => `blocked:issue-${id}`),
        ];

        // Combine label-based and relationship-based blocking identifiers for scanning
        // Always include the primary blocking label based on the completing issue's own identifier
        const allBlockingLabels = new Set([
          blockingLabel,
          ...blockingLabelsFromRelationships,
        ]);

        for (const scanCompanyId of companyIds) {
          try {
            const dependentIssues = await ctx.issues.list({
              companyId: scanCompanyId,
              status: "blocked",
              limit: 100,
            });

            if (!Array.isArray(dependentIssues)) continue;

            for (const dependent of dependentIssues) {
              // Check label model: does this dependent have a blocked:issue-X label
              // matching the completing issue (or any of its relationship-based identifiers)?
              const matchingLabels: string[] = [];
              const dependentLabelNames: string[] = (
                dependent.labels || []
              ).map((l: any) => (typeof l === "string" ? l : l?.name));

              for (const label of allBlockingLabels) {
                if (dependentLabelNames.includes(label)) {
                  matchingLabels.push(label);
                }
              }

              // Check relationship model: does this dependent have blockedBy referencing the completing issue?
              const dependentBlockedBy: string[] = Array.isArray(
                (dependent as any).blockedBy,
              )
                ? (dependent as any).blockedBy.filter(
                    (id: any) => typeof id === "string",
                  )
                : [];
              const hasRelationshipRef =
                dependentBlockedBy.includes(blockingIssueId) ||
                dependentBlockedBy.includes(blockingIdentifier);

              // Also check if the completing issue's blocks array contains this dependent
              const hasBlocksRef =
                blocksIdentifiers.includes(dependent.id) ||
                (dependent.identifier != null &&
                  blocksIdentifiers.includes(dependent.identifier));

              const isDependent =
                matchingLabels.length > 0 || hasRelationshipRef || hasBlocksRef;

              if (!isDependent) continue;

              try {
                // Remove ALL matching blocked:issue-X labels for this completing issue
                // (handles the case where the issue identifier appears in the label AND
                // via relationship-based references)
                const labelsToRemove = new Set(matchingLabels);
                const remainingLabels = (dependent.labels || []).filter(
                  (label: any) => {
                    const name =
                      typeof label === "string" ? label : label?.name;
                    return !labelsToRemove.has(name);
                  },
                );

                // Check if remaining labels include any blocker labels
                // (blocked:issue-Z for open issues, blocked:external, blocked:needs-approval)
                const remainingBlockerLabels = remainingLabels.filter(
                  (label: any) => {
                    const name =
                      typeof label === "string" ? label : label?.name;
                    return name?.startsWith("blocked:");
                  },
                );

                // Determine new status
                const stillBlocked = remainingBlockerLabels.length > 0;
                const newDepStatus = stillBlocked ? "blocked" : "todo";

                const targetAssignee =
                  dependent.assigneeAgentId ||
                  getAgentId(scanCompanyId, "implementer");

                // Resolve remaining label names to labelIds (UUIDs) — API silently drops name strings
                const remainingLabelNames: string[] = remainingLabels.map(
                  (l: any) => (typeof l === "string" ? l : l.name),
                );
                const remainingLabelIds = await getLabelIds(
                  scanCompanyId,
                  remainingLabelNames,
                );

                // Single atomic PATCH: status + labelIds + assignee clear
                // (follows AGE-4962 pattern — server commits both in one transaction)
                const patchBody: Record<string, any> = {
                  status: newDepStatus,
                  labelIds: remainingLabelIds,
                  assigneeAgentId: null,
                };

                await apiFetch(`${PAPERCLIP_API}/api/issues/${dependent.id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(patchBody),
                });

                // Second PATCH: re-assign to trigger wakeOnDemand
                if (targetAssignee) {
                  await apiFetch(`${PAPERCLIP_API}/api/issues/${dependent.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      assigneeAgentId: targetAssignee,
                    }),
                  });
                }

                const blockerDescription =
                  matchingLabels.length > 0
                    ? matchingLabels.join(", ")
                    : `${blockingIdentifier} (via blockedBy/blocks relationship)`;

                // Post auto-unblock comment documenting the event
                const commentBody = stillBlocked
                  ? `**Auto-Unblock (Partial)**\n\n${blockingIdentifier} resolved, removing ${blockerDescription}. Issue remains blocked by: ${remainingBlockerLabels.map((l: any) => (typeof l === "string" ? l : l?.name)).join(", ")}.\n\n[auto-unblock:${blockingIdentifier}]`
                  : `**Auto-Unblock**\n\n${blockingIdentifier} resolved, removing ${blockerDescription}. Issue fully unblocked → todo.\n\n[auto-unblock:${blockingIdentifier}]`;

                await apiFetch(
                  `${PAPERCLIP_API}/api/issues/${dependent.id}/comments`,
                  {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ body: commentBody }),
                  },
                );

                ctx.logger.info(
                  "Dependency watcher: processed dependent issue",
                  {
                    blockingIssue: blockingIdentifier,
                    blockingCompany: companyId,
                    dependentIssueId: dependent.id,
                    dependentIdentifier: dependent.identifier,
                    dependentCompany: scanCompanyId,
                    crossCompany: scanCompanyId !== companyId,
                    removedLabels: [...labelsToRemove],
                    remainingBlockers: remainingBlockerLabels.length,
                    newStatus: newDepStatus,
                  },
                );
              } catch (err) {
                ctx.logger.error(
                  "Dependency watcher: failed to unblock dependent issue",
                  {
                    dependentIssueId: dependent.id,
                    err,
                  },
                );
              }
            }
          } catch (err) {
            ctx.logger.info("Dependency watcher: scan failed for company", {
              scanCompanyId,
              err,
            });
          }
        }
      }

      // Log other status changes for observability
      if (TRIGGER_STATUSES.has(newStatus)) {
        ctx.logger.info("Issue transitioned to actionable status", {
          companyId,
          issueId,
          status: newStatus,
        });
        // Paperclip heartbeat handles agent wakeup on assignment
      }

      // NOTE: Dispatcher wakeup (Phase W-2 / AGE-691) removed — dispatcher role
      // is retired. Paperclip native heartbeat handles agent wakeup on status change.
    });

    // -------------------------------------------------------------------------
    // REACTIVE: approval.decided → auto-unblock linked issues (Phase 2.3)
    // When Chris approves or rejects a structural_change approval,
    // automatically unblock the linked issues and restore them to todo status.
    // -------------------------------------------------------------------------
    ctx.events.on("approval.decided", async (event: any) => {
      const companyId: string = event?.companyId ?? "";
      if (!companyId || !isConfiguredCompany(companyId)) return;

      const payload = event?.payload ?? {};
      const approvalType = payload?.type ?? "";
      const approvalStatus = payload?.status ?? ""; // "approved" or "rejected"
      const approvalId = event?.entityId ?? "";
      const issueIds = payload?.issueIds ?? [];
      const decisionNote = payload?.decisionNote ?? "";

      // Only handle structural_change approvals
      if (approvalType !== "structural_change") return;

      if (!Array.isArray(issueIds) || issueIds.length === 0) {
        ctx.logger.info("Approval resolution: no linked issues found", {
          approvalId,
          approvalType,
        });
        return;
      }

      ctx.logger.info(
        "Approval resolution: processing structural_change approval",
        {
          approvalId,
          status: approvalStatus,
          linkedIssueCount: issueIds.length,
        },
      );

      // Process each linked issue
      for (const issueId of issueIds) {
        try {
          const issue = await ctx.issues.get(issueId, companyId);
          const labels = issue?.labels ?? [];
          const hasApprovalLabel = labels.some((label: any) =>
            typeof label === "string"
              ? label === "blocked:needs-approval"
              : label.name === "blocked:needs-approval",
          );

          if (!hasApprovalLabel) {
            ctx.logger.info(
              "Approval resolution: issue not blocked on approval",
              {
                issueId,
                identifier: issue?.identifier,
              },
            );
            continue;
          }

          // Remove the blocked:needs-approval label
          const updatedLabels = (labels || []).filter((label: any) =>
            typeof label === "string"
              ? label !== "blocked:needs-approval"
              : label.name !== "blocked:needs-approval",
          );

          // Two-step PATCH: clear assignee then re-assign to force wakeOnDemand.
          // Paperclip only triggers agent wake when assigneeAgentId CHANGES.
          // NOTE: This two-step is for wakeOnDemand, NOT for the label+status atomicity bug.
          const targetAssignee =
            issue?.assigneeAgentId || getAgentId(companyId, "implementer");

          // Resolve label names to labelIds (UUIDs) — API silently drops name strings.
          const approvalLabelNames: string[] = updatedLabels.map((l: any) =>
            typeof l === "string" ? l : l.name,
          );
          const approvalLabelIds = await getLabelIds(
            companyId,
            approvalLabelNames,
          );

          await apiFetch(`${PAPERCLIP_API}/api/issues/${issueId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              status: "todo",
              labelIds: approvalLabelIds,
              assigneeAgentId: null,
            }),
          });

          await apiFetch(`${PAPERCLIP_API}/api/issues/${issueId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              assigneeAgentId: targetAssignee,
            }),
          });

          ctx.logger.info(
            "Approval resolution: unblocked issue on approval decision",
            {
              issueId,
              identifier: issue?.identifier,
              approvalStatus,
            },
          );

          // Post comment explaining the decision
          const commentBody =
            approvalStatus === "approved"
              ? `**Approval Granted — Ready for Work**

The board has approved this structural change request.

**Decision**: Approved
**Issue**: ${issue?.identifier}

This issue has been unblocked and is ready to proceed. Implementation can resume immediately.`
              : `**Approval Rejected — Review Required**

The board has rejected this structural change request.

**Decision**: Rejected
${decisionNote ? `**Reason**: ${decisionNote}` : "**Reason**: See approval decision for details."}
**Issue**: ${issue?.identifier}

This issue has been unblocked. Please review the rejection reason and revise your approach before resubmitting.`;

          await apiFetch(`${PAPERCLIP_API}/api/issues/${issueId}/comments`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ body: commentBody }),
          });

          ctx.logger.info("Approval resolution: posted decision comment", {
            issueId,
            approvalStatus,
          });
        } catch (err) {
          ctx.logger.error("Approval resolution: failed to unblock issue", {
            issueId,
            err,
          });
        }
      }

      ctx.logger.info("Approval resolution: completed processing approval", {
        approvalId,
        status: approvalStatus,
        issuesProcessed: issueIds.length,
      });
    });

    // ---------------------------------------------------------------------------
    // Cold-queue recovery defense (AGE-6413)
    // PaperClip's server-side cold-queue recovery re-queues completed issues
    // (status=done with completedAt set) based on stale checkout/execution run IDs
    // without checking status or completedAt. This causes done issues to reappear
    // in agents' queues, wasting compute and tokens.
    //
    // Defense strategy: periodic sweep every 2 minutes that queries all non-done
    // issues in configured companies and reverts any that have completedAt set
    // back to done. Complements the AGE-6126 deferred_comment_wake suppression,
    // which handles done→active via issue.updated events — cold-queue recovery
    // bypasses the event path entirely, so the sweep is the only defense.
    // ---------------------------------------------------------------------------
    async function sweepCompletedIssues() {
      for (const [companyId, companyCfg] of Object.entries(
        routingConfig.companies,
      )) {
        try {
          // Query all active (non-done, non-cancelled) issues for this company
          const issuesRes = await apiFetch(
            `${PAPERCLIP_API}/api/companies/${companyId}/issues?status=todo,in_progress,backlog,blocked,in_review,triage,unstarted&limit=200`,
          );
          if (!issuesRes.ok) continue;
          const issues: any[] = await issuesRes.json();

          for (const issue of issues) {
            const completedAt = issue.completedAt;
            const cancelledAt = issue.cancelledAt;
            // A zombie issue has a terminal timestamp (completedAt or cancelledAt) set
            // but is currently in an active status — cold-queue recovery bug
            const terminalTimestamp = completedAt ?? cancelledAt;
            if (!terminalTimestamp) continue; // No terminal timestamp — not a zombie

            // Determine the correct terminal status to revert to:
            // completedAt → done, cancelledAt → cancelled
            // If both are set (shouldn't happen, but defensive), prefer completedAt → done
            const revertStatus = completedAt ? "done" : "cancelled";

            const issueId = issue.id;
            const identifier = issue.identifier ?? issueId;
            const currentStatus = (issue.status ?? "").toLowerCase();

            ctx.logger.info(
              "Cold-queue recovery defense: detected zombie issue (terminal timestamp set, status not terminal)",
              {
                event: "cqr_zombie_detected",
                issueId,
                identifier,
                currentStatus,
                completedAt,
                cancelledAt,
                revertStatus,
              },
            );

            // Prune stale suppression timestamps from circuit breaker tracker
            const now = Date.now();
            const existingTs = (
              cqrSuppressionTracker.get(issueId) ?? []
            ).filter((ts) => now - ts < CQR_CIRCUIT_WINDOW_MS);
            cqrSuppressionTracker.set(issueId, existingTs);
            const recentSuppressions = existingTs.length;

            // Revert the issue to its appropriate terminal status
            const revertRes = await apiFetch(
              `${PAPERCLIP_API}/api/issues/${issueId}`,
              {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: revertStatus }),
              },
            );

            if (revertRes.ok) {
              ctx.logger.info(
                "Cold-queue recovery defense: reverted zombie issue to terminal status",
                {
                  event: "cqr_zombie_reverted",
                  issueId,
                  identifier,
                  previousStatus: currentStatus,
                  revertStatus,
                  completedAt,
                  cancelledAt,
                },
              );
            } else {
              const errBody = await revertRes.text();
              ctx.logger.warn(
                "Cold-queue recovery defense: failed to revert zombie issue",
                {
                  event: "cqr_zombie_revert_failed",
                  issueId,
                  identifier,
                  status: revertRes.status,
                  body: errBody,
                },
              );
              continue; // Don't post comment if revert failed
            }

            // Record suppression timestamp for circuit breaker
            existingTs.push(now);
            cqrSuppressionTracker.set(issueId, existingTs);

            // Post deduped comment
            const isDupAlert = await isDuplicateAlertComment(
              issueId,
              "cold-queue-recovery",
            );
            if (!isDupAlert && shouldEscalateToOrchestrator(companyId, "cold-queue-recovery")) {
              const orchestratorId = getAgentId(companyId, "orchestrator");
              await apiFetch(`${PAPERCLIP_API}/api/issues/${issueId}/comments`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  body: `**🔄 Cold-Queue Recovery Suppressed (AGE-6415)**\n\nThis issue was reverted from \`${currentStatus}\` back to \`${revertStatus}\`. PaperClip's cold-queue recovery re-queued a terminal-status issue (${completedAt ? `completedAt: ${completedAt}` : `cancelledAt: ${cancelledAt}`}) without checking its status.\n\nThis is a defense-in-depth sweep — the original bug (cold-queue recovery not filtering terminal statuses) should be fixed server-side.${recentSuppressions >= CQR_CIRCUIT_BREAKER_THRESHOLD ? `\n\n⚠️ **Circuit breaker:** This issue has been reverted **${recentSuppressions + 1} times in 30 minutes** — the cold-queue recovery bug is persistently re-queuing it. ${orchestratorId ? "Routing to orchestrator for investigation." : "Manual review required."}` : ""}\n\n[alert-dedup:cold-queue-recovery]`,
                }),
              });
              releaseAlertCommentInflight(issueId, "cold-queue-recovery");
            }

            // Circuit breaker: escalate if the same issue is repeatedly re-queued
            if (recentSuppressions >= CQR_CIRCUIT_BREAKER_THRESHOLD) {
              ctx.logger.warn(
                "Cold-queue recovery defense: circuit breaker triggered — issue repeatedly re-queued",
                {
                  event: "cqr_circuit_breaker",
                  issueId,
                  identifier,
                  recentSuppressions: recentSuppressions + 1,
                },
              );
            }
          }
        } catch (err) {
          ctx.logger.warn(
            "Cold-queue recovery defense: error scanning company issues",
            {
              companyId,
              error: String(err),
            },
          );
        }
      }
    }

    // ---------------------------------------------------------------------------
    // Stale agent watchdog (AGE-6131: Reed reliability)
    // Periodically scans all agents in configured companies for agents stuck in
    // status=running with stale lastHeartbeatAt. Resets them to idle so the
    // dispatcher can re-queue them. Prevents silent dispatch failures when a
    // gateway restart leaves agent.status pinned to "running".
    // ---------------------------------------------------------------------------
    const STALE_AGENT_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes — well beyond max waitTimeoutMs
    const STALE_AGENT_WATCHDOG_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

    async function sweepStaleAgents() {
      for (const [companyId, companyCfg] of Object.entries(
        routingConfig.companies,
      )) {
        try {
          const agentsRes = await apiFetch(
            `${PAPERCLIP_API}/api/companies/${companyId}/agents`,
          );
          if (!agentsRes.ok) continue;
          const agents: any[] = await agentsRes.json();

          for (const agent of agents) {
            if (agent.status !== "running") continue;

            const heartbeat = agent.runtimeConfig?.heartbeat;
            if (!heartbeat || !heartbeat.enabled) {
              // Agent has no heartbeat — check lastHeartbeatAt anyway
            }

            const lastHeartbeatAt = agent.lastHeartbeatAt
              ? new Date(agent.lastHeartbeatAt).getTime()
              : 0;
            const staleForMs = Date.now() - lastHeartbeatAt;

            if (staleForMs < STALE_AGENT_THRESHOLD_MS) continue;

            ctx.logger.info("Stale agent detected — resetting to idle", {
              event: "agent_stuck_state",
              agentId: agent.id,
              agentName: agent.name,
              companyId,
              lastHeartbeatAt: agent.lastHeartbeatAt,
              staleForMs,
              thresholdMs: STALE_AGENT_THRESHOLD_MS,
            });

            try {
              const resetRes = await apiFetch(
                `${PAPERCLIP_API}/api/agents/${agent.id}`,
                {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ status: "idle" }),
                },
              );
              if (resetRes.ok) {
                ctx.logger.info("Stale agent recovered → idle", {
                  agentId: agent.id,
                  agentName: agent.name,
                  companyId,
                  staleForMs,
                });
              } else {
                const errBody = await resetRes.text();
                ctx.logger.warn("Failed to reset stale agent status", {
                  agentId: agent.id,
                  agentName: agent.name,
                  companyId,
                  status: resetRes.status,
                  body: errBody,
                });
              }
            } catch (err) {
              ctx.logger.warn("Error resetting stale agent", {
                agentId: agent.id,
                agentName: agent.name,
                companyId,
                error: String(err),
              });
            }
          }
        } catch (err) {
          ctx.logger.warn(
            "Stale agent watchdog: error scanning company agents",
            {
              companyId,
              error: String(err),
            },
          );
        }
      }
    }

    // ---------------------------------------------------------------------------
    // Cross-company assignment guard sweep (AGE-7010)
    // Paperclip's native wakeOnDemand does not validate that the assigned agent's
    // company matches the issue's company. This causes cross-company wake events
    // where an AGE-scoped agent is dispatched for a KAL issue (or vice versa),
    // resulting in API auth failures and wasted run cycles.
    //
    // This sweep detects active issues where assigneeAgentId belongs to a different
    // company than the issue, and alerts the orchestrator for manual triage.
    // The server-side fix (recommended) should validate company match before
    // dispatching a wake event.
    // ---------------------------------------------------------------------------
    const XCA_CIRCUIT_BREAKER_THRESHOLD = 3;
    const XCA_CIRCUIT_WINDOW_MS = 30 * 60 * 1000; // 30 minutes
    const XCA_SWEEP_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
    const xcaSweepTracker = new Map<string, number[]>(); // issueId → timestamps

    // Build a lookup: agentId → companyId across ALL configured companies
    async function buildAgentCompanyMap(): Promise<Map<string, string>> {
      const map = new Map<string, string>();
      for (const [companyId] of Object.entries(routingConfig.companies)) {
        try {
          const agentsRes = await apiFetch(
            `${PAPERCLIP_API}/api/companies/${companyId}/agents`,
          );
          if (!agentsRes.ok) continue;
          const agents: any[] = await agentsRes.json();
          if (!Array.isArray(agents)) continue;
          for (const agent of agents) {
            if (agent.id && agent.companyId) {
              map.set(agent.id, agent.companyId);
            }
          }
        } catch {
          // Skip companies we can't read
        }
      }
      return map;
    }

    async function sweepCrossCompanyAssignments() {
      const agentCompanyMap = await buildAgentCompanyMap();
      if (agentCompanyMap.size === 0) return;

      for (const [companyId] of Object.entries(routingConfig.companies)) {
        try {
          const issuesRes = await apiFetch(
            `${PAPERCLIP_API}/api/companies/${companyId}/issues?status=todo,in_progress,backlog,blocked,in_review,triage,unstarted&limit=200`,
          );
          if (!issuesRes.ok) continue;
          const issues: any[] = await issuesRes.json();
          if (!Array.isArray(issues)) continue;

          for (const issue of issues) {
            const assigneeAgentId = issue.assigneeAgentId;
            if (!assigneeAgentId) continue; // Unassigned — skip

            const issueCompanyId = issue.companyId ?? companyId;
            const agentCompanyId = agentCompanyMap.get(assigneeAgentId);

            // Agent not found in any configured company — can't validate, skip
            if (!agentCompanyId) continue;

            // Company match — fine
            if (agentCompanyId === issueCompanyId) continue;

            // Cross-company mismatch detected!
            const issueId = issue.id;
            const identifier = issue.identifier ?? issueId;

            ctx.logger.warn("Cross-company assignment detected", {
              event: "xca_mismatch",
              issueId,
              identifier,
              issueCompanyId,
              assigneeAgentId,
              agentCompanyId,
            });

            // Prune stale suppression timestamps
            const now = Date.now();
            const existingTs = (xcaSweepTracker.get(issueId) ?? []).filter(
              (ts) => now - ts < XCA_CIRCUIT_WINDOW_MS,
            );
            xcaSweepTracker.set(issueId, existingTs);
            const recentDetections = existingTs.length;

            // Clear the mismatched assignee so Paperclip stops sending wasted wake events
            const clearRes = await apiFetch(
              `${PAPERCLIP_API}/api/issues/${issueId}`,
              {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ assigneeAgentId: null }),
              },
            );

            if (clearRes.ok) {
              ctx.logger.info("Cleared cross-company assignee", {
                event: "xca_assignee_cleared",
                issueId,
                identifier,
                assigneeAgentId,
                agentCompanyId,
                issueCompanyId,
              });
            } else {
              const errBody = await clearRes.text();
              ctx.logger.warn("Failed to clear cross-company assignee", {
                event: "xca_clear_failed",
                issueId,
                identifier,
                status: clearRes.status,
                body: errBody,
              });
            }

            // Record detection timestamp for circuit breaker
            existingTs.push(now);
            xcaSweepTracker.set(issueId, existingTs);

            // Post deduped alert comment
            const isDupAlert = await isDuplicateAlertComment(
              issueId,
              "cross-company-assignment",
            );
            if (!isDupAlert && shouldEscalateToOrchestrator(issueCompanyId, "xca-circuit-breaker")) {
              const orchestratorId = getAgentId(issueCompanyId, "orchestrator");
              const agentName = [...agentCompanyMap.entries()].find(
                ([id]) => id === assigneeAgentId,
              )
                ? assigneeAgentId
                : assigneeAgentId;
              await apiFetch(`${PAPERCLIP_API}/api/issues/${issueId}/comments`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  body: `**🔀 Cross-Company Assignment Detected (AGE-7010)**\n\nThis issue (company: \`${issueCompanyId}\`) was assigned to agent \`${assigneeAgentId}\` from a different company (\`${agentCompanyId}\`). Paperclip's native wakeOnDemand dispatched a wake event to this agent, whose API key cannot access the issue's company — causing authentication failures and wasted run cycles.\n\nThe mismatched assignee has been cleared. This issue needs manual re-assignment to an agent in the correct company.${recentDetections >= XCA_CIRCUIT_BREAKER_THRESHOLD ? `\n\n⚠️ **Circuit breaker:** This issue has been flagged **${recentDetections + 1} times in 30 minutes** — the underlying routing bug is persistently re-assigning cross-company agents. ${orchestratorId ? "Routing to orchestrator for investigation." : "Manual review required."}` : ""}\n\n**Root cause:** Paperclip wake dispatch does not validate agent↔issue company match (AGE-7010).\n\n[alert-dedup:cross-company-assignment]`,
                }),
              });
              releaseAlertCommentInflight(issueId, "cross-company-assignment");
            }

            // Circuit breaker: escalate if same issue repeatedly mismatched
            if (recentDetections >= XCA_CIRCUIT_BREAKER_THRESHOLD) {
              ctx.logger.warn(
                "Cross-company assignment: circuit breaker triggered",
                {
                  event: "xca_circuit_breaker",
                  issueId,
                  identifier,
                  recentDetections: recentDetections + 1,
                },
              );
            }
          }
        } catch (err) {
          ctx.logger.warn(
            "Cross-company assignment sweep: error scanning company",
            {
              companyId,
              error: String(err),
            },
          );
        }
      }
    }

    // ---------------------------------------------------------------------------
    // Reviewer close recovery sweep (AGE-6132)
    // When a reviewer posts a verdict comment (PASS/FAIL) but the status transition
    // to done/in_progress fails (e.g., ECONNREFUSED, gateway timeout), the issue
    // sits stranded in in_review or blocked:external with a verdict already rendered.
    // This sweep detects those cases and completes the close.
    //
    // Strategy:
    //   1. For each configured company with a reviewer, fetch in_review + blocked:external issues.
    //   2. For each issue, check if the latest comment from the reviewer contains a verdict.
    //   3. If PASS → transition to done (single atomic PATCH: status + clear assignee)
    //   4. If FAIL/REJECTED → transition to in_progress + reassign to implementer
    //   5. Circuit breaker: 3+ sweeps of the same issue in 30 min → escalation comment
    // ---------------------------------------------------------------------------
    async function sweepStrandedReviewerVerdicts() {
      for (const [companyId, companyCfg] of Object.entries(
        routingConfig.companies,
      )) {
        const reviewerAgentId = getAgentId(companyId, "reviewer");
        if (!reviewerAgentId) continue; // No reviewer in this company

        try {
          // Fetch issues in in_review and blocked:external
          const issuesRes = await apiFetch(
            `${PAPERCLIP_API}/api/companies/${companyId}/issues?status=in_review,blocked&limit=200`,
          );
          if (!issuesRes.ok) continue;
          let issues: any[] = await issuesRes.json();
          if (!Array.isArray(issues)) continue;

          // Filter to blocked:external only (PaperClip API doesn't filter by label,
          // so we get all blocked issues and narrow down)
          issues = issues.filter((issue: any) => {
            const status = (issue.status ?? "").toLowerCase();
            if (status === "in_review") return true;
            if (status === "blocked") {
              const labels = issue.labels ?? [];
              return labels.some((l: any) =>
                typeof l === "string"
                  ? l === "blocked:external"
                  : l.name === "blocked:external",
              );
            }
            return false;
          });

          for (const issue of issues) {
            const issueId = issue.id;
            const identifier = issue.identifier ?? issueId;
            const currentStatus = (issue.status ?? "").toLowerCase();

            try {
              // Fetch comments to find verdict
              const commentsRes = await apiFetch(
                `${PAPERCLIP_API}/api/issues/${issueId}/comments`,
              );
              if (!commentsRes.ok) continue;
              const allComments: any[] = await commentsRes.json();
              if (!Array.isArray(allComments) || allComments.length === 0)
                continue;

              // Find the most recent verdict comment from the reviewer
              const reviewerVerdicts = allComments
                .filter(
                  (c: any) =>
                    c.authorAgentId === reviewerAgentId &&
                    typeof c.body === "string" &&
                    RCR_VERDICT_PATTERN.test(c.body),
                )
                .sort(
                  (a: any, b: any) =>
                    new Date(b.createdAt ?? 0).getTime() -
                    new Date(a.createdAt ?? 0).getTime(),
                );

              if (reviewerVerdicts.length === 0) continue; // No verdict from reviewer

              const latestVerdict = reviewerVerdicts[0];
              const verdictBody = latestVerdict.body;
              const verdictMatch = verdictBody.match(RCR_VERDICT_PATTERN);
              if (!verdictMatch) continue;

              const verdict = verdictMatch[1].toUpperCase();
              const isPass = verdict.startsWith("PASS");

              ctx.logger.info(
                "Reviewer close recovery: detected stranded verdict",
                {
                  event: "rcr_verdict_detected",
                  issueId,
                  identifier,
                  currentStatus,
                  verdict,
                  reviewerAgentId,
                  verdictCommentId: latestVerdict.id,
                  verdictCreatedAt: latestVerdict.createdAt,
                },
              );

              // Prune stale sweep timestamps from circuit breaker tracker
              const now = Date.now();
              const existingTs = (rcrSweepTracker.get(issueId) ?? []).filter(
                (ts) => now - ts < RCR_CIRCUIT_WINDOW_MS,
              );
              rcrSweepTracker.set(issueId, existingTs);
              const recentSweeps = existingTs.length;

              // Determine target status and assignee
              let targetStatus: string;
              let targetAssignee: string | null = null;
              let verdictLabel: string;

              if (isPass) {
                targetStatus = "done";
                targetAssignee = null; // Clear assignee on close
                verdictLabel = "PASS";
              } else {
                // FAIL or REJECTED → reassign to implementer for rework
                targetStatus = "in_progress";
                targetAssignee = getAgentId(companyId, "implementer");
                verdictLabel = verdict;
              }

              // Apply the status transition (atomic PATCH)
              const patchBody: any = { status: targetStatus };
              if (isPass) {
                // Clear blocked labels on PASS
                patchBody.labelIds = [];
                // Clear execution fields — without this, CQR detects the stale
                // executionRunId (timed_out) and reverts done → in_progress, causing
                // an infinite review loop (AGE-11747).
                patchBody.executionRunId = null;
                patchBody.executionLockedAt = null;
                patchBody.executionAgentNameKey = null;
                patchBody.executionState = null;
              }
              if (targetAssignee) {
                patchBody.assigneeAgentId = targetAssignee;
              } else if (isPass) {
                patchBody.assigneeAgentId = null;
              }

              const patchRes = await apiFetch(
                `${PAPERCLIP_API}/api/issues/${issueId}`,
                {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(patchBody),
                },
              );

              if (!patchRes.ok) {
                const errBody = await patchRes.text();
                ctx.logger.warn("Reviewer close recovery: PATCH failed", {
                  event: "rcr_patch_failed",
                  issueId,
                  identifier,
                  targetStatus,
                  status: patchRes.status,
                  body: errBody,
                });
                continue;
              }

              ctx.logger.info(
                "Reviewer close recovery: completed status transition",
                {
                  event: "rcr_transition_completed",
                  issueId,
                  identifier,
                  previousStatus: currentStatus,
                  targetStatus,
                  verdict: verdictLabel,
                },
              );

              // Record sweep timestamp for circuit breaker
              existingTs.push(now);
              rcrSweepTracker.set(issueId, existingTs);

              // Post deduped comment
              const isDupAlert = await isDuplicateAlertComment(
                issueId,
                "reviewer-close-recovery",
              );
              if (!isDupAlert) {
                await apiFetch(`${PAPERCLIP_API}/api/issues/${issueId}/comments`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    body: `**🔄 Reviewer Close Recovery (AGE-6132)**\n\nThis issue had a reviewer verdict (**${verdictLabel}**) but was stranded in \`${currentStatus}\` — the status transition was likely dropped by a transient API failure. The sweep has completed the close.\n\n**Verdict:** ${verdictLabel}\n**Previous status:** \`${currentStatus}\`\n**New status:** \`${targetStatus}\`${targetAssignee ? `\n**Reassigned to:** implementer (\`${targetAssignee}\`)` : ""}${recentSweeps >= RCR_CIRCUIT_BREAKER_THRESHOLD ? `\n\n⚠️ **Circuit breaker:** This issue has been swept **${recentSweeps + 1} times in 30 minutes** — the status transition may be persistently failing. Manual review required.` : ""}\n\n[alert-dedup:reviewer-close-recovery]`,
                  }),
                });
                releaseAlertCommentInflight(issueId, "reviewer-close-recovery");
              }

              // Circuit breaker: escalate if the same issue is repeatedly swept
              if (recentSweeps >= RCR_CIRCUIT_BREAKER_THRESHOLD) {
                ctx.logger.warn(
                  "Reviewer close recovery: circuit breaker triggered — issue repeatedly swept",
                  {
                    event: "rcr_circuit_breaker",
                    issueId,
                    identifier,
                    recentSweeps: recentSweeps + 1,
                  },
                );
              }
            } catch (err) {
              ctx.logger.warn(
                "Reviewer close recovery: error processing issue",
                {
                  issueId,
                  identifier,
                  error: String(err),
                },
              );
            }
          }
        } catch (err) {
          ctx.logger.warn(
            "Reviewer close recovery: error scanning company issues",
            {
              companyId,
              error: String(err),
            },
          );
        }
      }
    }

    // ---------------------------------------------------------------------------
    // Stale execution lock sweep (AGE-7276)
    // Scans active issues for stale executionRunId locks (locked > 30 min)
    // and releases them via POST /api/issues/{id}/release.
    // Prevents concurrent runs for the same issue when a prior run is still
    // active (or has timed out/disappeared without clearing its lock).
    // ---------------------------------------------------------------------------
    async function sweepStaleExecutionLocks() {
      for (const [companyId, companyCfg] of Object.entries(
        routingConfig.companies,
      )) {
        try {
          // Query active issues that could have stale locks
          const issuesRes = await apiFetch(
            `${PAPERCLIP_API}/api/companies/${companyId}/issues?status=todo,in_progress,backlog,blocked,in_review,triage,unstarted&limit=200`,
          );
          if (!issuesRes.ok) continue;
          const issues: any[] = await issuesRes.json();
          if (!Array.isArray(issues)) continue;

          const now = Date.now();

          for (const issue of issues) {
            const executionRunId = issue.executionRunId;
            const executionLockedAt = issue.executionLockedAt;

            // No execution lock — skip
            if (!executionRunId || !executionLockedAt) continue;

            const lockedTime = new Date(executionLockedAt).getTime();
            if (Number.isNaN(lockedTime)) continue;

            const lockAgeMs = now - lockedTime;

            // Lock is fresh — not stale yet
            if (lockAgeMs < STALE_EXECUTION_LOCK_THRESHOLD_MS) continue;

            const issueId = issue.id;
            const identifier = issue.identifier ?? issueId;

            ctx.logger.info("Stale execution lock detected — releasing", {
              event: "sel_stale_lock_detected",
              issueId,
              identifier,
              executionRunId,
              executionLockedAt,
              lockAgeMs,
              thresholdMs: STALE_EXECUTION_LOCK_THRESHOLD_MS,
            });

            // Prune stale suppression timestamps from in-memory tracker
            const existingTs = (selSweepTracker.get(issueId) ?? []).filter(
              (ts) => now - ts < SEL_CIRCUIT_WINDOW_MS,
            );
            selSweepTracker.set(issueId, existingTs);
            const recentReleases = existingTs.length;

            // Release the execution lock via the /release endpoint
            try {
              const releaseRes = await apiFetch(
                `${PAPERCLIP_API}/api/issues/${issueId}/release`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({}),
                },
              );

              if (releaseRes.ok) {
                ctx.logger.info("Stale execution lock released", {
                  event: "sel_lock_released",
                  issueId,
                  identifier,
                  executionRunId,
                  lockAgeMs,
                });
              } else {
                const errBody = await releaseRes.text();
                ctx.logger.warn("Failed to release stale execution lock", {
                  event: "sel_release_failed",
                  issueId,
                  identifier,
                  status: releaseRes.status,
                  body: errBody,
                });
              }
            } catch (err) {
              ctx.logger.error("Error releasing stale execution lock", {
                issueId,
                identifier,
                err: String(err),
              });
            }

            // Record release timestamp for circuit breaker
            existingTs.push(now);
            selSweepTracker.set(issueId, existingTs);

            // Post deduped comment about the auto-release
            const isDupAlert = await isDuplicateAlertComment(
              issueId,
              "stale-execution-lock",
            );
            if (!isDupAlert && shouldEscalateToOrchestrator(companyId, "stale-lock-release")) {
              const orchestratorId = getAgentId(companyId, "orchestrator");
              await apiFetch(`${PAPERCLIP_API}/api/issues/${issueId}/comments`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  body: `**🔓 Stale Execution Lock Auto-Released (AGE-7276)**\n\nThe execution lock on this issue was held for **${Math.round(lockAgeMs / 60000)} minutes** (threshold: 30 min) by run \`${executionRunId}\` without producing output. The lock has been auto-released so subsequent runs can proceed.\n\nThis typically means a prior agent execution timed out or disappeared without clearing the lock. ${recentReleases >= SEL_CIRCUIT_BREAKER_THRESHOLD ? `\n\n⚠️ **Circuit breaker:** This lock has been auto-released **${recentReleases + 1} times in 30 minutes** — the underlying cause may need manual investigation. ${orchestratorId ? "Routing to orchestrator." : "Manual review required."}` : ""}\n\n[alert-dedup:stale-execution-lock]`,
                }),
              });
              releaseAlertCommentInflight(issueId, "stale-execution-lock");
            }

            // Circuit breaker: escalate if the same issue is repeatedly auto-released
            if (recentReleases >= SEL_CIRCUIT_BREAKER_THRESHOLD) {
              ctx.logger.warn(
                "Stale execution lock: circuit breaker triggered — issue repeatedly auto-released",
                {
                  event: "sel_circuit_breaker",
                  issueId,
                  identifier,
                  recentReleases: recentReleases + 1,
                },
              );
            }
          }
        } catch (err) {
          ctx.logger.warn(
            "Stale execution lock sweep: error scanning company issues",
            {
              companyId,
              error: String(err),
            },
          );
        }
      }
    }

    // Run initial sweep after 30s (avoid startup contention)
    const staleAgentInitial = setTimeout(() => {
      void sweepStaleAgents();
    }, 30_000);
    if (staleAgentInitial.unref) staleAgentInitial.unref();

    // Periodic sweep every 5 minutes
    const staleAgentInterval = setInterval(() => {
      void sweepStaleAgents();
    }, STALE_AGENT_WATCHDOG_INTERVAL_MS);
    if (staleAgentInterval.unref) staleAgentInterval.unref();

    // Cold-queue recovery defense sweep (AGE-6413)
    const cqrInitial = setTimeout(() => {
      void sweepCompletedIssues();
    }, 60_000);
    if (cqrInitial.unref) cqrInitial.unref();

    const cqrInterval = setInterval(() => {
      void sweepCompletedIssues();
    }, CQR_SWEEP_INTERVAL_MS);
    if (cqrInterval.unref) cqrInterval.unref();

    // Reviewer close recovery sweep (AGE-6132)
    const rcrInitial = setTimeout(() => {
      void sweepStrandedReviewerVerdicts();
    }, 90_000);
    if (rcrInitial.unref) rcrInitial.unref();

    const rcrInterval = setInterval(() => {
      void sweepStrandedReviewerVerdicts();
    }, RCR_SWEEP_INTERVAL_MS);
    if (rcrInterval.unref) rcrInterval.unref();

    // Stale execution lock sweep (AGE-7276)
    const selInitial = setTimeout(() => {
      void sweepStaleExecutionLocks();
    }, 45_000);
    if (selInitial.unref) selInitial.unref();

    const selInterval = setInterval(() => {
      void sweepStaleExecutionLocks();
    }, STALE_EXECUTION_LOCK_SWEEP_INTERVAL_MS);
    if (selInterval.unref) selInterval.unref();

    // Cross-company assignment guard sweep (AGE-7010)
    const xcaInitial = setTimeout(() => {
      void sweepCrossCompanyAssignments();
    }, 60_000);
    if (xcaInitial.unref) xcaInitial.unref();

    const xcaInterval = setInterval(() => {
      void sweepCrossCompanyAssignments();
    }, XCA_SWEEP_INTERVAL_MS);
    if (xcaInterval.unref) xcaInterval.unref();

    // AGE-7292: Periodic pruning of dispatch dedup tracker to prevent memory leaks.
    // Stale entries older than DISPATCH_DEDUP_WINDOW_MS are removed every minute.
    const dedupPruneInterval = setInterval(() => {
      pruneDispatchDedupTracker();
      pruneRecoveryRateTracker();
      for (const [k, ts] of orchCompanyDedupTracker) {
        if (Date.now() - ts >= ORCH_COMPANY_DEDUP_MS) orchCompanyDedupTracker.delete(k);
      }
    }, 60 * 1000);
    if (dedupPruneInterval.unref) dedupPruneInterval.unref();

    ctx.logger.info(
      "Issue Trigger v1.37.0 — event-routing only. Recovery cascade guard (AGE-8553): depth limit (3 ancestors) + per-company rate limit (5/24h) for stranded_issue_recovery issues, blocked:cascade label for observability. Checkout-level dispatch dedup (AGE-7292). Stale execution lock sweep + concurrent run guard (AGE-7276). Review gate (AGE-7550). Agent issue-creation rate limit (AGE-8523).",
    );
  },

  async onHealth() {
    return {
      status: "ok",
      message:
        "v1.40.0 — Event-routing only. No drain loop. Paperclip native heartbeat + executionPolicy handle wakeup and review. Dispatcher wakeup gated on dispatcher-agent presence (AGE-691). A.4 executionPolicy auto-apply on issue.created. Plan-first demotion (planRequired). Blocked-label validation. Auto-dependency detection (AGE-306). QA rejection circuit breaker (AGE-318). Recovery cascade guard (AGE-8553). Checkout-level dispatch dedup (AGE-7292). Retry storm breaker (AGE-5123). Continuation-requeue (AGE-5447). Alert dedup (AGE-5261). Dependency-aware auto-unblock (AGE-6080). Gate-check evidence enforcement (AGE-6129). Stale execution lock sweep (AGE-7276). Agent issue-creation rate limit (AGE-8523).",
    };
  },
});

export default plugin;
runWorker(plugin, import.meta.url);
