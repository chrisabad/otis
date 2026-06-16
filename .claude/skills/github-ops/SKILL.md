---
name: github-ops
description: GitHub repository and workflow operations using API/CLI. Use when you need to inspect repos, issues, PRs, workflows, releases, or automate project maintenance tasks tied to GitHub.
version: 1.0.0
audience: shared
---
# github-ops

## Access
- Token expected in `.env` as `GITHUB_TOKEN`.

## Core workflow
1. Validate token presence before any operation.
2. Prefer read-only inspection first (repo, issue, PR state).
3. For write actions (comment, close, merge, release), summarize planned action and require explicit user approval unless previously approved.

## Reliability rules
- Scope requests to exact owner/repo.
- Include direct links in outputs (issue/PR/workflow run URLs).
- For failures, report HTTP status + endpoint class (auth, permissions, rate limit, not found).

## Typical tasks
- PR review queue summaries
- Issue triage and labeling
- Release notes aggregation
- Workflow failure triage
