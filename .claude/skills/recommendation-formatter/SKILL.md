---
name: recommendation-formatter
description: "Strict five-section format (Signal, Impact, Recommendation, Next Steps, Execution Link) for any agent recommendation that needs Chris's approval. Use when surfacing a yes/no decision so Chris has the exact information needed to decide quickly."
version: 1.0.0
audience: shared
---
# Recommendation Formatter

## Context
When surfacing a recommendation or proposal that requires Chris's approval, all agents must use a strict, structured format.
This prevents noise and ensures Chris has the exact information needed to make a quick "yes/no" decision.

## The Format
Every recommendation must include exactly these five sections, formatted with bold headers:

1. **Signal:** [The raw observation, data point, or trigger event]
2. **Impact:** [Why this matters—the consequence of inaction or benefit of action]
3. **Recommendation:** [A specific, actionable proposal]
4. **Next Steps:** [A clear path forward that requires only a simple yes/no approval from Chris]
5. **Execution Link:** [A direct link to the PaperClip issue or other system of record where Chris can approve/track this, if applicable]

## Example Output

**Signal:** Growth metrics show zero traction on LinkedIn posts without image attachments over the last 14 days.
**Impact:** We are wasting 30% of our content effort on posts that the algorithm is suppressing.
**Recommendation:** Stop text-only posts immediately and require a visual asset for all future LinkedIn queue items.
**Next Steps:** I will update the Content Pipeline guidelines and flag any pending text-only posts for Marlowe to attach images. (Yes/No to approve)
**Execution Link:** [FON-12](http://127.0.0.1:3101/issues/55556266-24d1-4bf9-a403-296cbcace82a)

## Enforcement
Do not send freeform text when Chris's approval is needed. Use this exact structure.
