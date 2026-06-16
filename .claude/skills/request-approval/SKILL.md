---
name: request-approval
description: "Five-section structure (Signal, Impact, Recommendation, Next Steps, Execution Link) for escalating recommendations that need Chris's yes/no sign-off. Use whenever an agent needs explicit approval — pair with the recommendation-formatter skill for the broader rationale."
version: 1.0.0
audience: shared
---
# Request Approval Skill

## Context
When an agent escalates a recommendation that requires Chris's approval, it MUST follow this specific formatting structure.

## Structure
1. **Signal:** The observation or data point.
2. **Impact:** Why this matters (the consequence of inaction or the benefit of action).
3. **Recommendation:** A specific, actionable proposal.
4. **Next Steps:** A clear path forward that requires only a simple yes/no approval.
5. **Execution Link:** If tracked in PaperClip, provide a direct link to the issue.

## Example
**Signal:** Orbit Design has crossed 20K+ active users and 700+ reviews. Font Replacer isn't in major guides.
**Impact:** Losing potential organic growth and visibility.
**Recommendation:** Audit Figma Community Listing and outreach to guide authors.
**Next Steps:** Do you approve moving forward with these two recommendations?
**Execution Link:** [FON-16](http://127.0.0.1:3101/issues/FON-16)
