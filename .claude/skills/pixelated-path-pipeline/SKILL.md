---
name: pixelated-path-pipeline
description: Content creation, scheduling, and distribution pipeline for the Pixelated Path brand — LinkedIn posts, Substack newsletter drafts, and analytics rollups. Use when drafting LinkedIn content for Chris Abad, writing newsletter essays, queuing content for review, checking pipeline status across LinkedIn and Substack, or running the weekly analytics rollup. Also use when building or maintaining the pixelated-path-tools repo (scheduler, Substack client, analytics dashboard).
version: 1.0.0
audience: shared
agents: [otis, finn]
---
# Pixelated Path Pipeline

Content and tooling workflow for the Pixelated Path brand (Chris Abad's creator presence).

## Agents

- **Marlowe** — content strategy and drafting (LinkedIn posts, newsletters)
- **Finn** — tooling and automation (scheduler, Substack client, analytics)

## Content Channels

| Channel | Cadence | Tool |
|---------|---------|------|
| LinkedIn | 3 posts/week (Tues draft) | Content Studio (see below) |
| Substack | Weekly essay (Thurs draft) | Content Studio + Substack API (via Finn's client) |

## Content Pillars (LinkedIn)

1. AI in design practice — real workflows, not hype
2. Leadership + team dynamics — building people, not just products
3. Creative process — how good work actually gets made

## Content Studio (Taplio Replacement — active as of March 2026)

Content now moves through the **Content Studio** platform (PIX-19 epic). Taplio is replaced.

### Status state machine
`draft` → `qa_review` → `chris_review` → `approved` → `scheduled` → `published`

If Chris requests revisions: `chris_review` → `needs_revision` → back to `qa_review` after agent resubmits.
If Chris rejects: `chris_review` → `rejected` (terminal; requires rejectionNotes). Rejected → `draft` only if Chris explicitly unblocks.

### Content Studio API Authentication (CRITICAL — PIX-93 fix, 2026-03-27)

**Base URL:** `https://content-studio-sandy.vercel.app`

**Auth header:** `x-api-key: {CONTENT_STUDIO_API_KEY}` — key is in workspace `.env` as `CONTENT_STUDIO_API_KEY`

⚠️ Do NOT use `Authorization: Bearer`. That header routes to session cookie auth and returns 401 for all agent calls.

```
# Correct:
x-api-key: 153f1c66eecbb3678f5a466d57bf2b3b2af6014673f157538703c27a68170241

# Wrong (returns 401):
Authorization: Bearer <key>
```

### Key API endpoints (for agent use)
```
POST   /api/content                              — create draft
GET    /api/content                              — list (filter: business, channel, status, pillar, assigneeAgentId, date)
GET    /api/content/:id                          — get single piece + full history
PATCH  /api/content/:id                          — update draft body, status, assignee
PATCH  /api/content/:id/qa/:checkpoint           — write QA badge (see below)
POST   /api/content/:id/comments                 — add comment
PATCH  /api/comments/:id                         — resolve comment
GET    /api/comments?status=open&assigneeAgentId=<id>  — agent comment/revision polling
POST   /api/content/:id/metrics                  — write post-publish performance data
```

### QA checkpoints (all must pass before chris_review)
| Checkpoint | Owner | Notes |
|---|---|---|
| `essential_truth_check` | **Juno** | Runs 3-Layer Truth Test; blocking gate before qa_review |
| `voice_tone` | Marlowe | Matches Chris's voice guide |
| `hook_score` | Marlowe | Score 1–10 + reasoning |
| `copyedit` | Marlowe | Grammar, clarity, length |
| `seo_hashtags` | Marlowe | LinkedIn discoverability (where applicable) |

Each badge shape: `{passed: bool, score: int|null, notes: string, checked_by: agentId, checked_at: ISO8601}`

### Agent revision loop (polling — every 5 min)
```
GET /api/comments?status=open&assigneeAgentId=<my-id>
```
For each open comment: read body, revise draft via PATCH /api/content/:id, resolve comment via PATCH /api/comments/:id.

### ⚠️ Open spec gaps (filed March 2026 — pending Finn resolution)
- **PIX-35** — `needs_revision` status not yet in state machine (must be added to PIX-27)
- **PIX-36** — Comment polling endpoint path conflicts between PRD and PIX-29 (canonical path TBD)
- ~~**PIX-37** — Juno's role in essential_truth_check blocking gate~~ ✅ **Resolved 2026-03-26**: Juno owns `essential_truth_check`; it is a blocking gate; `checked_by: agentId` field is sufficient for tracking.

## Marlowe's Drafting Workflow

1. Read `memory/agents/marlowe-log.md` — avoid repeating prior angles/hooks
2. Draft 3 LinkedIn posts (150–300 words each, one per pillar)
   - First line = hook (never "I'm excited to share…")
   - Voice: direct, specific, occasionally irreverent, grounded in experience
3. Draft 1 newsletter essay (600–1000 words)
   - Structure: hook → story → insight → takeaway → closer
4. Create draft record via Content Studio — `POST /api/content` with **complete body** in the initial request. **Never POST a partial body and patch later.** Write the full draft first (in memory), verify it is complete, then POST once atomically. A truncated draft visible to Chris before a follow-up PATCH is a user-visible bug.
5. Run own QA checks (voice_tone, hook_score, copyedit, seo_hashtags) → PATCH /api/content/:id/qa/<checkpoint>
6. **Juno runs the Essential Truth Check** (3-Layer Truth Test) — see `skills/essential-truth-checker/SKILL.md`
   - Marlowe triggers Juno; Juno writes the `essential_truth_check` badge (`checked_by: JunoAgentId`)
   - **This is a blocking gate**: ❌ fail → Marlowe rewrites and resubmits; ✅ pass → advance to qa_review
   - Marlowe polls for the badge by checking `GET /api/content/:id` until `qa.essential_truth_check.passed` is set
7. Once all badges pass → use Content Studio skill (`skills/content-studio/SKILL.md`) to PATCH /api/content/:id `{status: "qa_review"}`
8. **Never publish directly** — all content requires Chris's approval (Approve button in Content Studio UI)
9. Append to log: angles used, hooks tried

See `references/voice-guide.md` for Chris's voice and style patterns.

## Finn's Tooling Stack

Repo: `chrisabad/content-studio` (private) — the ONLY canonical repo for all Content Studio and Pixelated Path tooling.

⚠️ `chrisabad/pixelated-path-tools` and `chrisabad/kaleidoscope-content-ops` are both ARCHIVED and DEPRECATED. Do NOT use them.

### LinkedIn Scheduler
- Lives in Content Studio: `scripts/publish-scheduler.ts` + `src/lib/linkedin-client.ts`
- Status (Mar 2026): credentials still blocked on Chris

### Substack Client
- Lives in Content Studio: `src/app/api/publish/substack/route.ts`
- Status: in development

### Analytics Dashboard
- Lives in Content Studio: `src/app/analytics/page.tsx`
- Sources: LinkedIn post engagement + Substack open rates
- Output: per-piece metrics card + cross-channel rollup in Content Studio

## Finn's Workflow

1. Check repo for open PRs + CI status: `gh pr list --repo chrisabad/content-studio`
2. Check Content Studio build progress (PIX-26 scaffold → PIX-27 API → PIX-28 QA → PIX-29 Comments)
3. Check blocker status (LinkedIn credentials) — if unresolved >2 weeks, DM D0AFURXGVTM with specific credential ask
4. Post status to relevant PIX PaperClip issues + `#pixelated-path`

## PaperClip Issue IDs

| Issue | What |
|-------|------|
| PIX-1 | LinkedIn content queue (legacy) |
| PIX-2 | Newsletter drafts (legacy) |
| PIX-4 | LinkedIn scheduler |
| PIX-5 | Substack client |
| PIX-6 | Content analytics dashboard |
| PIX-7 | Content pipeline repo |
| PIX-19 | [Epic] Content Studio — Taplio Replacement |
| PIX-26 | Scaffold repo + infra |
| PIX-27 | Content CRUD API |
| PIX-28 | QA checkpoint system |
| PIX-29 | Comments + auto-revision API |
| PIX-30 | Chris review UI |
| PIX-35 | Gap: needs_revision status (filed by Marlowe) |
| PIX-36 | Gap: comment polling endpoint (filed by Marlowe) |
| PIX-37 | Gap: essential_truth_check ownership (filed by Marlowe) |

## Escalation

- Content drafts → Content Studio UI (Chris approves before any publishing)
- Publishing decisions → Chris only (never auto-publish)
- Credential blockers → DM D0AFURXGVTM (Finn only, specific ask)
- Budget needed → route to Juno
