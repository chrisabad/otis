---
name: linkedin-posts
description: Browse and extract LinkedIn posts from any creator's profile for analysis, inspiration, or research. Use when Chris shares a LinkedIn profile URL, mentions a creator by name (e.g., "look at Ethan Evans' posts"), asks for inspiration from LinkedIn creators, or wants to analyze how someone communicates on LinkedIn. Also use when asked to review, summarize, or compare posts from a list of LinkedIn creators.
version: 1.0.0
audience: shared
agents: [otis, finn]
---
# LinkedIn Posts

## Access Method

LinkedIn is accessed via the **Hermes canvas browser on the Lauryn node**. Chris's LinkedIn account is already authenticated — no login needed.

```python
# Navigate to any LinkedIn URL
canvas(action="navigate", node="Lauryn", url="<url>")

# See what's on screen
canvas(action="snapshot", node="Lauryn")

# Extract text from the page
canvas(action="eval", node="Lauryn", javaScript="document.body.innerText")
```

## Viewing a Creator's Posts

The fastest way to see someone's recent posts (bypasses their full profile):

```
https://www.linkedin.com/in/<profile-slug>/recent-activity/shares/
```

Examples:
- Ethan Evans → `https://www.linkedin.com/in/ethan-evans-leadership/recent-activity/shares/`
- If you don't know the slug, navigate to `https://www.linkedin.com/search/results/people/?keywords=<name>` and find them

## Workflow

1. Navigate to the creator's recent activity URL
2. Snapshot to confirm the page loaded
3. Use `canvas eval` to extract the full post text:
   ```javascript
   document.body.innerText
   ```
4. Scroll down to load more posts if needed:
   ```javascript
   window.scrollBy(0, 3000)
   ```
5. Snapshot again, re-eval to get newly loaded content
6. Repeat scroll + eval until you have enough posts (typically 5–10 is sufficient for inspiration)

## Output Format

When summarizing posts for Chris, structure the output as:

**[Creator Name] — Recent LinkedIn Posts**
- Theme or topic pattern across posts
- 3–5 standout posts with key takeaways
- Observations on tone, format, and engagement hooks

## Known Creators

See `references/creators.md` for Chris's saved list of LinkedIn creators to track.

## Notes

- LinkedIn will occasionally prompt for re-authentication if the session expires. If you see a login page, notify Chris — he'll need to re-auth on Lauryn.
- The canvas browser does not support OAuth popups, so email/password login only if re-auth is needed.
- Avoid rapid navigation — add a 1–2 second pause between page loads to avoid rate limiting.
