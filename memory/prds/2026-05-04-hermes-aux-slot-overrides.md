# PRD: Hermes auxiliary slot overrides — title_gen / compression / approval / session_search / web_extract → fast
**Date:** 2026-05-04
**AGE Issue:** AGE-12602
**Author:** Otis
**Type:** Large

## Objective
Hermes provides 8 auxiliary task slots that default to `auto` (= reuse the agent's main model). Per the Hermes docs, several of these are explicitly recommended to be overridden to cheap/fast models. We currently have **0 of 8 set on any agent in the fleet** — every Slack DM burns the full main model (currently GLM-5.1 thinking) on a session-title generation, every compaction goes through GLM-5.1, every `approval_mode: smart` command-risk score does too. Add `auxiliary:` blocks to the 4 highest-volume agents (Juno, Quinn, Ellis, Axel) routing 5 of the 8 slots to `fast`.

## Background
Per https://hermes-agent.nousresearch.com/docs/user-guide/configuring-models, the 8 slots and their docs-recommended treatment:

| Slot | Fires on | Docs recommendation |
|---|---|---|
| `title_gen` | Session start/summary | "cheap fast model" |
| `vision` | Image input | Override only if main lacks vision |
| `compression` | Context management | "cheaper models recommended" |
| `session_search` | Cross-session recall | "cheap keeps costs predictable" |
| `approval` | `approval_mode: smart` risk-scoring | "fast/cheap to avoid waste" |
| `web_extract` | Web ops | "summarization-focused models" |
| `skills_hub` | `hermes skills search` | "usually fine at auto" |
| `mcp` | MCP tool routing | "usually fine at auto" |

The 5 slots in scope (title_gen, compression, session_search, approval, web_extract) all benefit from a non-thinking, fast model — `fast` (gemma4:31b) — because each is a structural side task that doesn't need reasoning. Leaving `vision` at `auto` keeps the main model's vision capability available for image inputs; `skills_hub` and `mcp` are docs-blessed at `auto`.

This is the side-task complement to AGE-12601 (smart-router). AGE-12601 routes the *main* call by complexity; AGE-12602 routes *aux* calls by task-type. Together they cut LLM cost and latency from both directions.

## Files to be Changed

For each in-scope agent, add a top-level `auxiliary:` block to `~/.hermes/profiles/<agent>/config.yaml`:

```yaml
auxiliary:
  title_gen:
    provider: custom
    model: fast
  compression:
    provider: custom
    model: fast
  session_search:
    provider: custom
    model: fast
  approval:
    provider: custom
    model: fast
  web_extract:
    provider: custom
    model: fast
```

Agents in initial scope:

| Agent | Profile path | Why included |
|---|---|---|
| Juno | `~/.hermes/profiles/juno/config.yaml` | Highest user-facing volume (Slack DMs) |
| Quinn | `~/.hermes/profiles/quinn/config.yaml` | Reviews many issues; lots of title_gen + compression |
| Ellis | `~/.hermes/profiles/ellis/config.yaml` | Engineering routine — lots of compression on long codepaths |
| Axel | `~/.hermes/profiles/axel/config.yaml` | Engineering volume |

Other agents (Reed, Orion, Vera, Comms, Sentinel, etc.) are deferred to a follow-up after observation.

## Cross-Agent Impact
- All 4 agents see faster + cheaper side-task calls. No change to their main reasoning behavior.
- Other agents: untouched.
- The auxiliary block is additive — existing model.default and other config keys unchanged.

## Acceptance Criteria
- [ ] All 4 in-scope agents have an `auxiliary:` block with the 5 slots set to `fast`.
- [ ] Each agent's gateway restarts cleanly via `launchctl kickstart -k gui/$(id -u)/ai.hermes.gateway-<agent>`.
- [ ] Slack/Paperclip connectivity verified per agent post-restart (look for "Slack connected" or equivalent for non-Slack agents).
- [ ] No errors in `~/.hermes/profiles/<agent>/logs/gateway.log` referencing aux model resolution.
- [ ] Backups taken: `cp config.yaml{,.bak-<ts>}` per agent before edit.
- [ ] config-changes.md entry per agent edit.
- [ ] Smoke: send Juno a DM that triggers a fresh session — confirm `title_gen` resolved through `fast` (look for `litellm.acompletion(model=openai/gemma4:31b)` in litellm-proxy logs).

## Rollback Plan
- Per-agent backups taken before edit.
- Revert: `cp <bak> ~/.hermes/profiles/<agent>/config.yaml && launchctl kickstart -k gui/$(id -u)/ai.hermes.gateway-<agent>` (~30s per agent).
- Total rollback for all 4 agents ≤3 min.
- Slots are independently rollbackable — could revert just one slot per agent if a specific aux task regresses.

## Risks & Mitigations
- **Hermes config schema rejects `auxiliary:` block** — verified against the docs URL. If it fails, gateway logs the validation error and falls back to main-model behavior (no functional regression). Easy to debug + revert.
- **`fast` (gemma4:31b) produces weak `title_gen` outputs** — possible. Titles are advisory; users rarely depend on them being clever. Easy to roll back per slot if observed.
- **`approval` slot gives wrong risk score with weaker model** — most acute concern. Approval scoring does affect what commands get auto-approved vs. require human gate. Consider keeping `approval` at `auto` for the engineering agents (Axel, Ellis) on first rollout; restore it as a follow-up once we observe `fast`'s scoring quality. **Mitigation: roll out approval slot last, observe, revert if needed.**
- **Concurrent restart blip across 4 agents impacts active work** — restart agents serially, verify each before next. ~30s blip per agent, total ~2 min.

## Peer Review
@Quinn — Specific concerns I'd love your read on: (a) the `approval` slot — is gemma4:31b's command-risk-scoring quality acceptable for the engineering agents (Axel, Ellis) who most depend on approval_mode: smart, or should we keep that slot at `auto` for them? (b) any of the 4 agents in scope that you'd swap with a different prioritization? (c) `compression` — does the QA workflow ever rely on compression preserving subtle context? Worried about losing nuance with a smaller model.

30-min review window opens at: 2026-05-04 23:08 PT.
Result: [pending]

## Out of Scope (deferred AGE issues)
- Fleet-wide rollout to Reed, Orion, Vera, Comms, Sentinel, Lookout, Email Groomer, etc.
- Per-slot model tuning (e.g. some slots may want `routine` instead of `fast`).
- `vision` / `skills_hub` / `mcp` overrides — currently left at `auto` per docs guidance.
- Smart-router as primary model — covered separately by AGE-12601 (Track A).
