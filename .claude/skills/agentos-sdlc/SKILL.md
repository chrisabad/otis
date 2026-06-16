---
name: agentos-sdlc
description: Worktree discipline for all AgentOS repos. Use when modifying any file in hermes, agentos-config, agentos-services, paperclip-issue-trigger, agentos-docs, .hermes, content-studio, or font-replacer. Teaches agents to use `agentos-dev` instead of direct git commands to prevent production-tree mutations.
version: 1.0.0
audience: shared
---
# AgentOS SDLC Skill — Worktree Discipline

**Mandatory for all agents.** Any change to a tracked AgentOS repo MUST go through `agentos-dev` worktree workflow. Direct `git checkout` or `git switch` on a production tree is a violation that triggers auto-revert and a Paperclip alert.

## When to Invoke

Read this skill BEFORE any of these actions on a tracked AgentOS repo:

- Modifying any file (code, config, docs, skills, memory, AGENTS.md, SOUL.md)
- Creating branches or switching branches
- Committing changes
- Opening PRs
- Running `git checkout`, `git switch`, `git branch`, or `git worktree add` directly

**Do NOT use raw git commands for branching or checkout.** Use `agentos-dev` instead.

## Tracked Repos

**AgentOS platform repos** (use `agentos-dev` for all changes):

| Repo (GitHub) | Dev tree | Runtime / deploy target | Default Branch | Notes |
|---|---|---|---|---|
| `hermes` | `~/repos/hermes` | npx + patches in `~/.hermes/patches/` | `main` | Gateway runtime; external-package + patches pattern |
| `agentos-config` | `~/repos/agentos-config` | `~/.hermes` | `main` | AgentOS configuration schema. Two-clone deploy. |
| `agentos-services` | `~/repos/agentos-services` | `~/.agentos-services` | `main` | I&M HTTP services. Two-clone deploy. |
| ~~`openclaw-llm-proxy`~~ | ~~decommissioned~~ | ~~`~/.litellm`~~ | ~~`main`~~ | Decommissioned in Cloud Migration Phase 6. |
| `paperclip-issue-trigger` | `~/repos/paperclip-issue-trigger` | `~/.paperclip/plugins/issue-trigger/` | `main` | Issue lifecycle plugin. Two-clone. |
| `agentos-docs` | `~/repos/agentos-docs` | Mintlify cloud | `main` | Documentation. Push-to-deploy. |

**Business app repos** (managed by AgentOS but not platform infrastructure):

| Repo | Dev tree | Default Branch | Notes |
|---|---|---|---|
| `content-studio` | `~/repos/content-studio` | `main` | Vercel-deployed business app |
| `font-replacer` | `~/repos/figma-plugin-font-replacer` | `master` | Vercel-deployed business app |

> **Removed from this list:** `.hermes-workspace` (`~/.hermes/`) is being converted to runtime-only — its remote (`juno-backup`) was deleted from GitHub. Durable artifacts move to canonical homes (`agentos-config/scripts/`, `agentos-config/hermes/profiles/`, etc.) under AGE-12323.

**Why worktrees?** For these repos, the working tree IS production. A `git checkout` on a feature branch deletes production files from disk. The 2026-04-22 incident (774 files deleted, 4+ hour gateway outage) was caused by an agent switching branches in `~/.hermes`. Worktrees isolate all changes in `~/worktrees/<repo>/<branch>` — the production tree never moves.

## Full Worktree Lifecycle

### 1. Start — Create a worktree

```bash
agentos-dev start <issue-id> [--repo <name>] [--branch <custom-name>]
```

- Creates a worktree at `~/worktrees/<repo>/<branch-name>`
- Creates branch (default: `fix/<issue-id>`, or `feat/<issue-id>` with `--branch`)
- If `--repo` omitted, detects current repo (refuses to start from production tree if not on default branch)
- Prints the `cd` command to enter the worktree

**Example:**

```bash
agentos-dev start AGE-6433 --repo hermes
# Output: cd ~/worktrees/hermes/fix/AGE-6433
```

### 2. Edit — Make changes in the worktree

```bash
cd ~/worktrees/hermes/fix/AGE-6433
# Edit files normally — you're in the isolated worktree
```

All file edits happen inside the worktree. The production tree remains untouched.

### 3. Commit — Stage and commit changes

```bash
agentos-dev commit "Fix gateway health check timeout handling"
```

- Stages all changes (`git add -A`) in the current worktree
- Refuses if not in a worktree (safety check)
- Adds `Co-Authored-By: <agent-name> @hermes.ai` trailer for attribution
- Set agent name via `AGENTOS_AGENT_NAME` env var (default: `axel`)

### 4. Finish — Push and open PR

```bash
agentos-dev finish [--pr-title "<title>"] [--pr-body "<body>"]
```

- Pushes current branch to origin
- Opens PR via `gh` (auto-generates title from branch name: `[AGE-XXXX] <subject>`)
- If `PAPERCLIP_API_KEY` and `AGENTOS_ISSUE_ID` are set, posts PR URL as a comment on the Paperclip issue

### 5. Merge — After CI passes, merge the PR

Use GitHub's merge button or `gh pr merge`. The production tree picks up changes via `git pull origin main` on the next cycle.

### 6. Cleanup — Remove the worktree

```bash
agentos-dev cleanup <issue-id-or-branch>
```

- Removes worktree directory
- Deletes local branch if fully merged
- Also handles legacy `~/repos/hermes-worktrees/` paths

**Alternative (post-merge automation):**

```bash
agentos-dev on-merge <pr-number>
```

Called by GitHub Actions or PR merge hook. Auto-triggers cleanup.

### 7. Status — Check worktree state

```bash
agentos-dev status
```

- Lists all active worktrees across all tracked repos
- Shows branch, uncommitted changes, ahead/behind upstream
- Warns if any production tree is off its default branch

## Branch Naming Convention

| Pattern | When to use | Example |
|---------|-------------|---------|
| `fix/<issue-id>` | Default. Bug fixes, patches, config changes | `fix/AGE-6433` |
| `fix/<issue-id>-<slug>` | When multiple branches for the same issue | `fix/AGE-6433-sdlc-skill` |
| `feat/<issue-id>-<slug>` | New features or additions | `feat/AGE-6433-audit-tool` |

PR titles follow `[AGE-XXXX] <subject>` format (auto-generated by `agentos-dev finish`).

## PR Gatekeeper Policy (AGE-12363)

No implementer may merge their own PR without review. Each business has a designated PR gatekeeper (approver) who audits diffs and merges only approved PRs.

### Gatekeeper Roster

| Business | Company Code | Gatekeeper | Agent ID |
|---|---|---|---|
| AgentOS | AGE | Ellis | `4d8114cc-f0af-4f76-9f38-db804a1ff6b4` |
| Kaleidoscope | KAL | Quinn | `6d76a359-8e93-44a4-8165-47387838b834` |
| Weekend | WEE | Vera | `ecd60f5f-0628-4a41-98a8-332344ab1eae` |
| Font Replacer | FON | Tess | `e83e4e46-79bd-4303-b0af-d62cc394a1d3` |
| Diacritic Mining | DIA | Reviewer | `47a5b353-e8d4-4e9c-8fa0-1d7f5a3e4b2c` |
| Pixelated Path | PIX | Reviewer | `3eb51795-1204-4099-8427-a45e24870394` |
| Studio Method | STU | STU Reviewer | `8704dfef-0ebd-4738-957b-82ce5735886b` |
| Personal | PER | TBD | (no reviewer yet) |

*Gatekeepers are Platform Operations & Reliability Engineer (Ellis/AGE), Studio stakeholders (Quinn/KAL, Vera/WEE, Tess/FON), or designated reviewers (DIA, PIX, STU).*

### Workflow

**Phase 1 (Current): Manual Enforcement**

1. Implementer opens PR via `agentos-dev finish`
2. Implementer tags the gatekeeper in PR description (e.g., `@quinn-agent`)
3. Gatekeeper audits the diff for code quality, security, breaking changes, and compliance with SDLC discipline
4. Gatekeeper approves with `gh pr review --approve`
5. Gatekeeper merges with `gh pr merge --squash` (or `--rebase` per repo convention)
6. Implementer pulls from `main` to sync local trees

**Phase 2 (Blocked by AGE-12381): Automated Enforcement**

Automated per-agent GitHub Apps will enforce merge gating and log all merge operations. Implementers will no longer have merge permissions; only gatekeepers can approve and merge. This prevents accidental self-merges and provides audit trail for compliance.

### Anti-Pattern: Self-Merge

**Never** use `gh pr merge --admin` or force-merge your own PR. Self-merges bypass gatekeeper review and are logged in Paperclip.

**BAD:**
```bash
cd ~/worktrees/hermes/fix/AGE-12363
agentos-dev finish
gh pr merge --admin  # VIOLATION — self-merge without review
```

**GOOD:**
```bash
cd ~/worktrees/hermes/fix/AGE-12363
agentos-dev finish
# Wait for gatekeeper to review and merge
git checkout main
git pull origin main  # Sync the merged changes
agentos-dev cleanup fix/AGE-12363
```

Self-merges trigger automatic rollback and file a Paperclip incident (AGE-12000 class). Even if CI passes, skipping gatekeeper review is a violation of SDLC discipline.

### Reference

- **AGE-12363**: PR Gatekeeper Governance Policy (this deliverable)
- **AGE-12381**: Phase 2 blocker — Automated GitHub Apps for merge enforcement
- **routing-rules.json**: Company-to-gatekeeper routing rules at `~/.hermes/routing-rules.json`

## Error Recovery

### Push fails (rejected by remote)

```bash
# Pull rebase on the worktree branch, then re-push
cd ~/worktrees/<repo>/<branch>
git pull --rebase origin main
agentos-dev finish
```

### Merge conflicts after rebase

```bash
# List conflicting files
cd ~/worktrees/<repo>/<branch>
git diff --name-only --diff-filter=U

# Resolve each conflict manually, then:
git add -A
git rebase --continue
agentos-dev finish
```

### Worktree already exists

```bash
agentos-dev start AGE-6433 --repo hermes
# Output: "Worktree already exists at ~/worktrees/hermes/fix/AGE-6433"
# Just cd into it:
cd ~/worktrees/hermes/fix/AGE-6433
```

If the existing worktree is stale or corrupted:
```bash
agentos-dev cleanup fix/AGE-6433
agentos-dev start AGE-6433 --repo hermes
```

### Dirty worktree (uncommitted changes blocking switch)

```bash
# Either commit the changes:
agentos-dev commit "WIP: partial changes"

# Or stash them:
cd ~/worktrees/<repo>/<branch>
git stash
# ...switch or rebase...
git stash pop
```

### Production tree off default branch

`agentos-dev start` will refuse with an error. Fix this first:

```bash
cd <production-path>
git checkout main  # or: git checkout master
# Then retry agentos-dev start
```

**Important:** Only use `git checkout main` on a production tree if you are intentionally switching back to the default branch. The post-checkout hook will auto-revert unauthorized branch switches. If the hook fires, it means an agent (or you) tried to switch away from the protected branch — fix the root cause, don't override the hook.

### `agentos-dev commit` says "Not in a worktree"

```bash
# You're in the production tree. cd to the worktree first:
cd ~/worktrees/<repo>/<branch>
agentos-dev commit "your message"
```

## Override for Emergency Maintenance Window

The post-checkout hook auto-reverts unauthorized branch switches. In an emergency (e.g., gateway is down and you must patch production directly), set:

```bash
export HERMES_ALLOW_BRANCH_SWITCH=1
```

This disables the auto-revert for that checkout. **Only use during maintenance windows.** Every override is logged and may trigger a Paperclip alert.

Similarly, for direct pushes to the protected branch:

```bash
export HERMES_ALLOW_DIRECT_PUSH=1
```

**Both overrides must be approved by Chris or Juno** before use. File a Paperclip issue documenting the emergency reason.

## Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `AGENTOS_AGENT_NAME` | Agent name for Co-Authored-By attribution | `axel` |
| `PAPERCLIP_API_KEY` | PaperClip API key for PR→issue linking | (none) |
| `PAPERCLIP_API_URL` | PaperClip API URL | `http://127.0.0.1:3101` |
| `PAPERCLIP_COMPANY_ID` | PaperClip company ID for issue linking | (none) |
| `PAPERCLIP_RUN_ID` | PaperClip run ID for issue linking | (none) |
| `AGENTOS_ISSUE_ID` | PaperClip issue ID for PR comment | (none) |
| `HERMES_ALLOW_BRANCH_SWITCH` | Override post-checkout hook auto-revert | (not set) |
| `HERMES_ALLOW_DIRECT_PUSH` | Override pre-push hook protection | (not set) |

## Safety Nets (Already Deployed)

Even if an agent forgets this skill and attempts a direct `git checkout`:

1. **Post-checkout hook** (Phase 1) — auto-reverts the branch switch if the gateway is alive, files a Paperclip alert.
2. **Pre-push hook** (Phase 4, planned) — will refuse pushes from production trees to protected branches.

These are safety nets, not primary mechanisms. The skill and `agentos-dev` tool are the correct path.

## Quick-Start Checklist

For every code change to a tracked AgentOS repo:

- [ ] **Start**: `agentos-dev start <AGE-XXXX>`
- [ ] **cd** into the worktree path printed by `start`
- [ ] **Edit** files in the worktree (never the production tree)
- [ ] **Commit**: `agentos-dev commit "descriptive message"`
- [ ] **Finish**: `agentos-dev finish` (pushes + opens PR)
- [ ] **Wait** for CI/merge
- [ ] **Cleanup**: `agentos-dev cleanup <branch>` after merge

**Never** `git checkout` or `git switch` on a production tree. **Never** push directly to `main`. Always use the worktree workflow.