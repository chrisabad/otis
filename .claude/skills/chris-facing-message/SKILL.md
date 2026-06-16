---
name: chris-facing-message
description: "Quality gate for any Slack message Chris will read. Three-question check (should Chris see this; will he understand in 5s; does he know what to do next) before posting. Use before any DM or channel post Chris monitors. Exceptions: thread replies to direct questions, and NO_REPLY decisions."
version: 1.0.0
audience: shared
---
# Chris-Facing Message Skill

## Context
Before posting ANY message to a Slack channel or DM that Chris will see, every agent MUST pass through this quality gate. This applies to all message types: status updates, alerts, task completions, recommendations, findings, and proactive signals.

The only exceptions are:
- Replies in a thread where Chris directly asked a question (still use clear language, but skip the gate check)
- NO_REPLY decisions (you decided not to post — no gate needed)

## The Gate: Three Questions

Before posting, answer these silently:

1. **Should Chris even see this?**
   - Is this actionable for Chris, or is it internal system/agent noise?
   - Would a good chief of staff interrupt for this?
   - If the answer is no → log to `memory/cron-inbox.md` or post to PaperClip instead. Do NOT post to Slack.

2. **Will Chris understand this in 5 seconds?**
   - No jargon, no ticket IDs without context, no raw system language
   - Lead with what happened in plain English, not with emoji or status labels
   - If Chris would ask "what does this mean?" → rewrite before posting

3. **Does Chris know what to do next?**
   - Every message must end with one of:
     - A clear ask ("Do you want me to proceed with X?")
     - An explicit "no action needed" statement ("FYI only — I've already handled this.")
     - A decision prompt with options ("Two paths: A or B. I recommend A because [reason].")

## Message Structure

All Chris-facing messages must follow this structure (adapt length to importance):

**Subject line:** One plain-English sentence summarizing what happened.
**Why it matters:** One sentence on impact or relevance to Chris's priorities. (Skip for simple FYI updates.)
**Details:** Supporting context — keep it short. Use bullets, not paragraphs.
**What's needed from you:** Explicit ask, or "No action needed — [what I already did]."

### For Recommendations Requiring Approval

When the message requires Chris's approval, use the `request-approval` skill structure instead (Signal → Impact → Recommendation → Next Steps → Execution Link). That skill is a specialized subset of this one.

## What NOT to Post

These should NEVER appear as messages to Chris:
- Streaming status artifacts ("Status: complete. Final answer posted below.")
- Heartbeat acknowledgments ("Heartbeat Ack — PIX-76 Wake")
- Internal task labels ("Drain Loop Action — 2026-03-26")
- Raw error output (":warning: :email: Message failed")
- Agent-to-agent coordination (use PaperClip)
- Cron execution confirmations (log to `memory/cron-inbox.md`)
- Vague alerts without a "so what?" ("⚠️ Action needed: [broad category]")
- **Bare ticket IDs without context** ("WEE-2: three decisions stalled" → Chris has no idea what WEE-2 is)

## PaperClip-Sourced Messages (Common Failure Pattern)

When your message originates from PaperClip issue data, strip all internal identifiers before posting. Chris does not know issue IDs or internal tracker state.

### ❌ Bad (PaperClip jargon leaking out)
> ⚠️ WEE-2: Three strategic decisions stalled at 13 days. Escalation needed.
> - Game Quality Standards: in design, no scope/Linear tracker yet
> - Pre-Production Process: executing in WoF but not documented
> - Contractor Bench Expansion: pending Finance approval signal

(Chris doesn't know what WEE-2 is. "13 days" from when? What does "stalled" mean in context? What does Chris need to DO?)

### ✅ Good (same information, Chris-ready)
> Three design strategy decisions have been open for 2+ weeks with no forward movement — they're starting to block planning for Q2.
>
> - **Game Quality Standards doc** — being designed but no timeline or owner yet
> - **Pre-Production Process** — you're running it on WoF but it's not written down yet
> - **Contractor Bench Expansion** — waiting on a budget signal from Finance
>
> Recommend setting a hard deadline of Apr 1 for each, or explicitly deferring them. Want me to draft the decision prompts?

**Rule:** Before posting any PaperClip-sourced content, do a find-replace in your head: replace every ticket ID with a plain-English description. If you can't describe it in one sentence, you don't understand it well enough to escalate it.

## Tier Check (from SOUL.md)

Before posting, classify by notification tier:
- **Critical:** Send immediately (auth failure, data loss, something Chris explicitly asked to be pinged about)
- **High:** Send at next natural check-in or proactively within 1 hour
- **Medium:** Batch into next brief
- **Low:** Log silently — do NOT post to Slack

If you're unsure whether something is Medium or Low, it's Low.

## Examples

### ❌ Bad
> ⚠️ Action needed: Competitor threat identified.
> *Signal:* Orbit Design plugin (Figma) claims 20K+ active users + 700+ reviews.

(Buries the lede. Doesn't say why Chris should care. Doesn't say what to do.)

### ✅ Good
> A Figma plugin called Orbit Design has 20K+ users and 700+ reviews — Font Replacer isn't showing up in any 2026 design tool guides despite solving a known pain point. We're losing organic visibility to them.
>
> I recommend we audit our Figma Community listing for SEO and reach out to guide authors. I've created FON-16 to track this. Approve here: [link]

### ❌ Bad
> Heartbeat Ack — PIX-76 Wake

(System noise. Chris should never see this.)

### ❌ Bad
> Status: complete. Final answer posted below.

(Streaming artifact. Should be suppressed.)

### ✅ Good (FYI, no action)
> Font Replacer just hit 500 installs — up 12% from last week. No action needed, just tracking the trend.

## Enforcement
This skill is referenced in every agent's context file. Agents that post messages failing this gate will have the pattern logged in `memory/fault-log.md` as `chris_facing_noise`.
