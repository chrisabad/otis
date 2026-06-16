---
name: writing-editor
description: Edit any text draft to sound like Chris Abad — direct, specific, occasionally irreverent, grounded in real experience. Use when Chris provides a draft for a LinkedIn post, newsletter essay, or Slack message and wants it calibrated to his authentic voice.
version: 1.0.0
audience: shared
agents: [otis, finn]
---
# Writing Editor

This skill calibrates writing to Chris Abad's authentic voice, bridging the gap between "Generic AI" and his real practitioner POV.

## Workflow

1. **Identify the format**: LinkedIn post, newsletter essay, podcast show notes, or short-form take.
2. **Consult the Voice Guide**: Read `references/voice-guide.md` for Section 3 (20 Rules), Section 4 (System Prompt), and Section 6 (Hook Writing).
3. **Hook first — mandatory**: Before anything else, apply the Hook Framework (below) to the first 1-2 sentences. A weak hook disqualifies the post regardless of body quality.
4. **Draft/Edit**: Apply the rules to the full text.
5. **Outsider Test**: Run the Outsider Test (below) — mandatory for every draft.
6. **Self-Review**: Run the "Sounds Like Chris" checklist in Section 3.2.

## Key Principles
- **Blunter is better**: Precision sounds blunt. Replace safe, corporate abstractions with practitioner reality.
- **No throat-clearing**: Cut the intro. Start with the thing.
- **Consequence-first**: State what's lost or what's at risk before explaining the fix.
- **Time anchors**: Ground claims in Chris's real history (Google, Dropbox, Square, 20+ years).

---

## Hook Framework (LinkedIn — non-negotiable)

The hook is the most critical part of any LinkedIn post. A post with a weak hook fails regardless of body quality. Every LinkedIn draft must pass this framework before it ships.

### The Two Hard Requirements

**1. Mobile character limit: ≤140 characters**
LinkedIn mobile truncates at ~140 characters. The hook sentence must fit inside that window AND create tension on its own. A neutral, context-setting opener that fits 140 chars but says nothing interesting is still a failing hook.

**2. Blank line after the hook**
LinkedIn desktop truncates at the first blank line ("see more" appears there). Every post must have a blank line immediately after the hook sentence. This is a formatting requirement, not stylistic.

**Format template — every LinkedIn post:**
```
[Hook sentence — ≤140 chars, creates tension]
                                              ← blank line (required)
[Body of post...]
```

### The 4 Hook Patterns That Work for Chris's Voice

**Pattern 1 — Confession with stakes**
Personal admission that immediately signals something went wrong (or right, unexpectedly). Stakes must be implicit in the first sentence.
- ✅ "I cut the wrong person once. I still think about it." (52 chars)
- ✅ "I stayed at a job two years too long." (37 chars)
- Template: `[I did X] + [consequence or emotional residue in one short sentence]`

**Pattern 2 — Surprising reversal**
State something that sounds wrong on the surface, then let the post explain it. Reader's initial reaction is "wait, how?"
- ✅ "We built an AI tool that made our senior designers less important. We shipped it anyway." (86 chars)
- ✅ "The hardest conversation I've had as a design leader wasn't a firing." (69 chars)
- Template: `[Thing that sounds counterintuitive]` — silence, no explanation yet

**Pattern 3 — Setup + immediate collapse**
Establish something — then knock it down in the same sentence or the next.
- ✅ "My AI adoption rollout was textbook. It collapsed in a week." (60 chars)
- Template: `[Seems like a win] + [Immediate reversal]`

**Pattern 4 — Consequence before cause**
Open with the result — something that already happened — before explaining what caused it. Reverse the natural narrative order.
- Template: `[Outcome] + [the thing that created it, unnamed yet]`

### Hook Anti-Patterns (rewrite immediately)

| Anti-pattern | Fix |
|---|---|
| "I want to talk about..." | Start with the observation, not the framing |
| "Here are 5 things I learned about X" | State the one most important thing; let the rest follow |
| "As a design leader, I've noticed that..." | Cut "As a design leader" — just make the observation |
| "Have you ever wondered why [easy thing]?" | Make it a statement with stakes |
| "The design world is changing fast." | Name what specifically changed and when |
| "Most designers don't realize that..." | Reframe as an observation about a situation, not a knowledge gap |
| Context dump as opener | State the observation first, provide context second |
| Neutral first sentence with no implied outcome | Ask: what happens next? The hook should imply something went wrong, or right, or sideways |

### Hook Scoring Rubric

**Score 3 — publish-ready:**
- Creates tension or curiosity in the first sentence
- Fits ≤140 chars
- Could stand alone as a post (even if the rest didn't exist)
- Sounds like a person, not a brand

**Score 2 — edit needed:**
- Hook is present but second sentence is doing most of the work → move the better line up
- Creates mild interest but no tension → sharpen the stakes
- Slightly jargon-y for a cold reader → simplify

**Score 1 — rewrite required:**
- Starts with context before the observation
- Begins with "I want to..." or "Today I'm sharing..."
- Could have been written by anyone, about any topic
- Uses motivational or corporate language
- No implied tension, stakes, or outcome

Minimum publish threshold: Score 2 on a path to 3. Score 1 = rewrite before continuing.

### "Would I Stop Scrolling?" Test

Before submitting a hook for review, ask: *If I were a senior designer scrolling LinkedIn at 7pm after a long day, would I stop at this line?*

If the answer is "maybe" → it's a no. Rewrite it.

---

## Outsider Test (Cohesion & Clarity — run on every draft)

Chris's audience includes design leaders, creative directors, and AI practitioners — but they have zero context on his specific work, team, tools, or internal projects. A reader should not need to know anything about Pixelated Path, Weekend, or Chris's current company to follow every sentence.

**Ask of every paragraph:**
- Could a senior designer at a company Chris has never worked at follow this without Googling anything?
- Is every technical term (tool names, process jargon, internal acronyms) either defined in context or replaced with plain language?
- Does each sentence connect to the next? (Read them aloud — if a transition feels jarring, flag it.)
- Is the cause-and-effect chain clear? (Don't assume the reader sees the same logic chain you do.)

**Common failure modes to flag and fix:**
- **Undefined tooling jargon**: "component callouts," "design system tokens," "FigJam link" — replace or briefly gloss
- **Assumed org context**: "like we did in the rebrand" — the reader doesn't know which rebrand
- **Insider distinction without explanation**: "Not AI-assisted. AI-generated." — the distinction is real but needs one sentence of context
- **Pronoun drift**: "they" and "we" shifting referents mid-paragraph
- **Sentence that requires the prior conversation to make sense**: if it only works in a thread, it's not done yet

**Fix instructions**: When flagging, rewrite the passage — don't just note the problem.

---

## Final Checklist (every LinkedIn post, in order)

- [ ] Hook is ≤140 characters
- [ ] Hook creates tension, reversal, or stakes — not a neutral statement
- [ ] Blank lines after hook: ≤65 char hook → TWO blank lines; >65 chars (wraps) → ONE blank line
- [ ] No jargon a cold reader can't follow
- [ ] No assumed org context
- [ ] Last line is the sharpest line — nothing after it
- [ ] Free of "excited to share," "5 things I learned," and all anti-patterns
- [ ] Written to a peer, not a mentee
