---
name: project-plugin-fixes-2026-05-30
description: kaleidoscope-issue-trigger plugin structural fixes applied 2026-05-30 — executionPolicy bug, prefix removal, dead code cleanup
metadata:
  type: project
---

Completed structural fixes to the kaleidoscope-issue-trigger plugin (worker.js) on 2026-05-30.

**Why:** Plugin was the root cause of orchestrator burst storms and broken autonomous workflow across all businesses.

**Fixes applied to `/docker/paperclip-ezk7/data/plugins/kaleidoscope-issue-trigger/dist/worker.js`:**

1. **executionPolicy null check bug (A.4)** — changed `!issue.executionPolicy` → `!issue.executionPolicy?.stages?.length`. Paperclip returns `{mode:"normal",stages:[]}` (non-null) so the old check never fired; new issues never got reviewer/approver stages auto-applied.

2. **Removed prefix detection** — removed `isGateIssue` and `needsApproval` prefix guards (`[infra]/[deploy]/[config]`). Approval stage now always applied when `approverAgentId` is configured. Both review (Ellis: `a3e4c733`) and approval (Juno: `a38cd7bc`) stages now always applied to all new issues for configured companies.

3. **Removed 126 lines of dispatcher wakeup dead code** — three blocks removed:
   - issue.created dispatcher wakeup
   - issue.updated dispatcher wakeup  
   - Blocker auto-promotion dispatcher wakeup
   All dispatcher roles were removed from routing-rules.json; these were dead code since `getAgentId(companyId, "dispatcher")` always returns null.

4. **Updated manifest** — added `issues.write`, `comments.write`, `agents.manage` to capabilities (was only declaring `events.subscribe` + `issues.read`).

**Verified:** AGE-172 (test issue, cancelled) confirmed A.4 fires correctly — both stages applied automatically within 3s of issue creation.

**Backup:** `/docker/paperclip-ezk7/data/plugins/kaleidoscope-issue-trigger/dist/worker.js.bak-20260530-135718`

**How to apply:** These fixes are to the compiled `dist/worker.js`. AGE-24 (gitops for plugin source) is still open — source changes needed before next deploy.

**Still pending:**
- Cold-queue sweep (`sweepColdQueue`) is effectively dead code (early-returns when dispatcher=null) but still makes API calls; remove in source refactor
- AGE-24: gitops for plugin source (so these fixes survive rebuilds)
- Manifest DB entry still shows old capabilities (Paperclip caches at install time)
