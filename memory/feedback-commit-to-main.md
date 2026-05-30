---
name: feedback-commit-to-main
description: Commit directly to main for this repo; no PRs needed
metadata:
  type: feedback
---

Commit changes directly to main at the end of interactive sessions. No PRs.

**Why:** This is a private operational config repo — the repo is Otis's working memory. PRs add friction with no review benefit when Chris is the only human. Dangling unmerged PRs at session end are worse than direct commits.

**How to apply:** At natural stopping points or end of session, stage and commit all context/memory changes and push to main. Autonomous runs do the same before exiting. Always exclude `.env` (already gitignored).
