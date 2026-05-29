# AGE Phase 2 Stabilization PRD
**Date:** 2026-05-29  
**Status:** In Progress  
**Owner:** Otis  
**Audit Source:** age-stabilization-audit workflow (2026-05-29)

## Objective
Make the AGE cloud VPS fleet fully autonomous, observable, and clean before onboarding FON. "Autonomous" means routines fire on schedule, assigned issues wake agents without human intervention, and backlog work gets done without manual waking. Build cross-company foundations that FON inherits at zero marginal cost.

## Current State (post-audit)
**Working:** Issue-trigger plugin v1.44.0 active, backlog promotion and wakeOnDemand dispatch functional, 7 agents launchable, Ellis SDLC + Juno Slack configured, 6/7 agents have full 29-skill baseline.

**Broken:** All 14 routines have no triggers and have never fired. Two maintenance routines reference the old local company ID (0f6e2b9b) and Mac paths. Vera is missing 5 skills including soul-maintenance-guideline.md.

**Missing:** No notification service on VPS (Juno dedup path silently broken). No memory/broker/Graphiti stack on VPS. No Redis for ephemeral state. No MCP (no mcporter). No exec hooks. No Langfuse tracing. OPENAI_API_KEY (LiteLLM proxy key) status on VPS agents unverified.

## Scope
All work happens on VPS at 100.117.92.5. Cross-company foundations are built with environment-variable-driven config so FON can reuse with no code changes.

## Work Items (in execution order)

### AUTONOMY
- **AGE-A1: Verify/fix OPENAI_API_KEY (LiteLLM key) on all VPS agents** — urgent, small, blocking. Recurring regression pattern (AGE-14029). Must confirm before agents do any LLM work.
- **AGE-A2: Wire cron triggers on all active routines + fix maintenance routine references** — high, small. All 14 routines have triggers: []. Fix 2 maintenance routines referencing old company ID 0f6e2b9b and Mac paths.
- **AGE-A3: Smoke test issue-trigger wakeup path end-to-end** — high, small. Verify plugin promotes backlog→todo AND agent actually wakes and processes. Orion does this.
- **AGE-A4: Archive dispatch routine + enable topology audit** — medium, small. Remove the dispatch-class routine that violates architecture. Enable topology audit as a tripwire.

### SHARED INFRASTRUCTURE
- **AGE-I1: Deploy notification service to VPS (port 8012)** — high, small-medium. Pure Postgres + HTTP, no external calls. Juno's dedup path is silently broken without it.
- **AGE-I2: Deploy memory service (8010) + broker (8011) to VPS** — high, medium. Systemd units, sourced from agentos-services repo. Broker file-based ledger first, Redis migration later.
- **AGE-I3: Deploy Redis + migrate broker to Redis-backed dedup** — medium, medium. Replaces file-atomic ledger with multi-process-safe Redis for 7 concurrent agents.
- **AGE-I4: Sync vera's 5 missing skills** — medium, small. Copy from shared/skills/ — get-paperclip-run-details, im-services, paperclip-recover-stalled-issue, slack-intel-scan, soul-maintenance-guideline.md.
- **AGE-I5: Deploy mcporter to VPS** — medium, medium. Start with context7. Document which agents need which MCP servers.
- **AGE-I6: Plan Graphiti/Neo4j/embedding deployment** — low, large. Requires RAM audit. ~4.3GB stack. Memory service degrades gracefully without it, so this waits.

### OBSERVABILITY
- **AGE-O1: Enable Routine Health Monitor + PR-bearing-done audit routines** — medium, small. Wire daily triggers on both.
- **AGE-O2: Deploy exec hooks for structured run logging** — medium, medium. Post-exec hook writing agent-id, session-duration, issue-handled, exit-status. Parameterized by $AGENT_ID.
- **AGE-O3: Wire Langfuse tracing via LiteLLM env vars** — medium, small-medium. Add LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY, LANGFUSE_HOST to all agent .env files from Infisical.

## Cross-Company Foundations
All services must be environment-variable-driven (DB URL, board key, bind address, base paths). When FON onboards, stand up second instances with FON-specific env. Redis key namespacing by company prefix. Shared skill library at /opt/hermes-profiles/shared/skills/ is the inherited baseline.

## Success Criteria
- [ ] At least 5 active routines firing on schedule without manual wakeup
- [ ] One end-to-end test: file backlog issue → plugin promotes → agent wakes → completes → done (no human touch)
- [ ] Notification service running on VPS and Juno using it for dedup
- [ ] Memory + broker running on VPS
- [ ] All 7 agents at 29 skills
- [ ] Langfuse traces visible for VPS agent LLM calls
- [ ] Zero dispatch-class routines on AGE board
