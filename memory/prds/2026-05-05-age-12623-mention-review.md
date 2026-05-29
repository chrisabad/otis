# PRD: Fix @-Mention Review Gate (AGE-12623)
**AGE-12623** | 2026-05-05 | Otis

## Problem

The `agentos-change` skill gates every Large change behind a 30-min @-mention peer review window. The mechanics fire correctly — Paperclip's `findMentionedAgents` parses the comment and fires a wake-on-demand on the mentioned agent within ~10s. But Quinn and Ellis's heartbeat prompts only check `in_review` issues assigned to them. They wake, find nothing assigned, report "nothing to do," and exit. The 30-min silence window auto-closes with no actual review.

**Result:** Every Large change in this fleet has been approved by convention (silence = no objection), never by actual peer review. The governance gate exists on paper only.

## Root Cause

Quinn's SOUL.md `## Heartbeat Execution Rules` step 1 reads: "Check assignments — GET your in_review issues." There is no step to check for @-mention review requests in issue comments.

## Fix

Add `## @-Mention PRD Reviews` section to Quinn's SOUL.md. Lightweight version to Ellis's SOUL.md.

### Quinn (primary reviewer)

Add a step before the in_review queue check: query open issues for recent comments mentioning @Quinn and respond if found with no prior Quinn reply.

### Ellis (approval awareness)

Add a similar lightweight step. Ellis's formal role is executionPolicy stage 2 (PR approval), but @-mentions to Ellis for Large-change awareness should also get explicit responses.

## Bootstrap Deadlock Note

This fix cannot be reviewed by Quinn before being applied — that's the bug being fixed. Proceeding under Chris's standing autonomous-driving delegation per memory/project_drive_hermes_im_project.md. Documented here for audit trail.

## Files

- `~/.hermes/profiles/quinn/SOUL.md`
- `~/.hermes/profiles/ellis/SOUL.md`

No gateway restart required. Changes take effect on the next heartbeat for each agent.

## Acceptance

Quinn's next heartbeat after a fresh `@Quinn` @-mention: Quinn reads the comment thread and posts an explicit review response before the 30-min window closes.
