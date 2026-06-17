# AGE template cutover — COMPLETE + validated (2026-06-04)

The AGE 3-role template is live and proven end-to-end. This is the reusable per-business pattern (FON/PER instantiate it).

## Final AGE roles + identity model
- **Juno = `ceo`** (orchestrator; never an issue assignee).
- **Axel = `cto`** (implementer; recovery routes to cto natively). The only worker. GitHub **App** (`app/axel-agentos`) authors/opens PRs.
- **Ellis = `qa`** (reviewer/approver). Approves+merges PRs using **Chris's `chrisabad` fine-grained PAT** (in AWS SM `agentos/ellis/github_approver_pat`); then posts a **PASS verdict** to advance the Paperclip review stage.
- Retired (paused): Orion, Quinn, Vera, Dex.
- **Identity model:** implementer App authors PRs → approver PAT (chrisabad) approves+merges → Chris never authors/approves. Distinct identities = no self-approval bind.

## The gate (two coupled layers)
1. **GitHub**: branch protection requires CI (ubuntu) + 1 approving review. Real PR + green CI + Ellis approval to merge.
2. **Paperclip**: execution policy single stage `review→Ellis`. The issue reaches `done` only when Ellis posts a **PASS verdict** (merge alone does NOT auto-complete — there is no merge→done coupling). Forcing `done` without this reverts (proof-of-work guard / review stage). Verified: AGE-366 done only via merged PR #56; AGE-367 (no PR) forced-done → reverted.

## CI/CD (Mac decommissioned)
- All CI moved off the dead `agentos-mac` self-hosted runner to **`ubuntu-latest`** (paperclip-issue-trigger, agentos-docs).
- **Plugin auto-deploy** on merge to main: `deploy.yml` → `tailscale/github-action` (secret `TAILSCALE_AUTHKEY`, tag:ci) → ssh (secret `VPS_SSH_KEY`) → `deploy/vps-deploy.sh`: token-auth fetch main, drain runs (port 3100), **container restart** to reload (NOT `paperclipai plugin install` — needs board auth 403; NOT `npm build` — devDeps/esbuild absent; committed dist is esbuild-bundled).
- agent-instructions + skills deploys also hosted→VPS (tailscale+ssh); agent-instructions deploys to **/opt/hermes-profiles** (the path the runtime reads; was wrongly /docker/.../agent-instructions).
- Secrets `TAILSCALE_AUTHKEY` + `VPS_SSH_KEY` set on all deploy repos.

## Dry-run findings (fixed)
- **AGE-352 safeguards never compiled** — phantom-completed without CI; had undefined `issue` refs + version mismatch + lint errors. Fixed + landed on main (PR #53). esbuild built dist ignoring tsc errors, so it shipped broken.
- **Axel posted diff *comments* instead of real PRs** — HEARTBEAT had no PR step. Fixed: clone→branch→commit→`gh pr create`→in_review (PR #166, durable in agentos-config).
- **Ellis thought "merge completes the issue"** — it doesn't; added the PASS-verdict step.

## Residual issues (noted, not blocking)
- **Cascade still reassigns to Juno**: during the dry-run AGE-366 got reassigned to `ceo` (Juno) mid-flow — the AGE-352 reassignment-cap/domain guard did NOT catch this path (invariant: ceo never an assignee). The gate still held (no phantom), but the guard needs hardening.
- **Proof-of-work guard is format-based** (checks for a PR-URL string, fakeable) — the real protection is the review stage + Ellis verifying the merge. A true merge-verified gate (gh-api merged check) remains a future hardening (Patch B).
- **Agent heartbeats are hours apart**; wake via assignee toggle (wakeOnDemand) or @mention — but toggling churns execution state, prefer @mention.

## Key access (for future runs)
- Embedded PG: `docker exec -e PGPASSWORD=paperclip paperclip-ezk7-paperclip-1 psql -h /tmp -p 54329 -U paperclip -d paperclip`
- Review-stage advance = reviewer PASS verdict comment (no approvals object for `review`-type stages; `POST /approvals/:id/approve` is for `approval`-type stages).
