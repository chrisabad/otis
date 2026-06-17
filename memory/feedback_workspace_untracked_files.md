---
name: feedback-workspace-untracked-files
description: Always check for untracked files in agent workspace repos before committing to avoid accidentally including stray files
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 85275e0c-b9ad-4ba6-b1ee-9628d9f523db
---

When committing to repos checked out in agent workspace directories (e.g. `/opt/hermes-profiles/axel/workspace/agentos-config`), always run `git status` and explicitly stage only the intended files rather than using `git add -A` or `git add .`.

**Why:** Agent workspaces accumulate stray untracked files (patches, test scripts, temp files) that get swept into commits unintentionally. This has happened multiple times — e.g. PR #244 to agentos-config accidentally included `062-recovery-exponential-backoff.patch` and `backoff-test.js` that were sitting in the workspace.

**How to apply:** Before any commit in an agent workspace repo, run `git status --short` and review untracked files. Stage specific paths (`git add hermes/profiles/`) rather than the whole tree. If stray files are present, either `.gitignore` them or explicitly exclude them from the staging command.
