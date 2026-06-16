---
name: model-eval
description: |
  Run model evaluations for the AGE fleet. Tests model candidates against the
  task harness on the VPS and queries Langfuse for production trace data.
  Triggers: "run eval", "model eval", "bakeoff", "test model", "candidate models",
  "switch model", "change routine model", "what model should we use".
---

# Model Eval Skill

Evaluate LLM model candidates for AGE fleet roles. All evals run on the Paperclip VPS
(`100.117.92.5`) through the eval wrapper, which bypasses LiteLLM and connects directly
to Ollama Cloud using the kaleidoscope key.

## Critical context (read before evaluating)

- **Goal**: cheapest model that reliably completes tasks — NOT highest-performing
- **Current assignments**: `routine` → `deepseek-v4-flash` (Medium tier), `interactive` → `glm-5.1:cloud` (High tier)
- **LiteLLM aliases**: models are aliased as `routine`/`interactive` in LiteLLM — one change updates the whole fleet
- **Eval harness bypasses LiteLLM**: use raw model names (e.g. `deepseek-v4-flash`), not aliases
- **CRITERIA.md** at `evals/model-bakeoff/CRITERIA.md` is the source of truth for pass/fail rules and history
- **OLLAMA_BASE_URL is how fleet routing works**: `provider: auto` in Hermes detects `ollama-cloud` and hardcodes `https://ollama.com/v1` — overriding `base_url` in config.yaml. The only way to redirect it to LiteLLM is `export OLLAMA_BASE_URL=http://srv1724463.hstgr.cloud:42171/v1` in each profile's `.env`. This is set fleet-wide (all 11 profiles on 100.117.92.5). Missing this = 401 storm (happened 2026-06-15, AGE-824 follow-on).

## Eval setup on VPS

All eval infrastructure is at:
- **Wrapper**: `/opt/hermes-wrappers/eval.sh` — direct Ollama + valid PAPERCLIP_API_KEY
- **Profile**: `/opt/hermes-profiles/eval-direct/` — kaleidoscope key, base_url=ollama.com/v1
- **Tasks**: `/docker/paperclip-ezk7/data/repos/otis/evals/model-bakeoff/tasks/`
- **Results**: `/tmp/bakeoff_results/` (ephemeral, save to memory after runs)
- **SSH key**: `/tmp/vps_key` (fetch from AWS SM `agentos/otis/vps_ssh_key` if missing)

## Running an eval

### Quick check (3 discriminating tasks)

Focus tasks for `routine` role: `t3_instruction`, `t5_tool_roundtrip`, `t6_auth_secret`

```bash
ssh -i /tmp/vps_key -o StrictHostKeyChecking=no root@100.117.92.5 "
TASKS=/docker/paperclip-ezk7/data/repos/otis/evals/model-bakeoff/tasks
MODEL=deepseek-v4-flash  # change this
for task in t6_auth_secret t3_instruction t5_tool_roundtrip; do
  echo \"=== \$MODEL on \$task ===\"
  timeout 120 /opt/hermes-wrappers/eval.sh chat -Q -q \"\$(cat \$TASKS/\$task.txt)\" \\
    -m \"\$MODEL\" --provider auto --yolo --max-turns 10 --accept-hooks 2>&1 | tail -5
done
"
```

### Full bakeoff (all 6 v1 tasks via run.sh)

run.sh is in the repo, but uses the vera wrapper (which now points to LiteLLM).
**Override the PROFILE** to use eval.sh instead:

```bash
ssh -i /tmp/vps_key -o StrictHostKeyChecking=no root@100.117.92.5 "
cd /docker/paperclip-ezk7/data/repos/otis/evals/model-bakeoff
PROFILE=eval ./run.sh 'nemotron-3-nano:30b deepseek-v4-flash' eval
"
```

Note: run.sh uses `/opt/hermes-wrappers/<PROFILE>.sh` — pass `eval` as the profile arg.

### bakeoff-v2.py (tool-call correctness)

```bash
ssh -i /tmp/vps_key -o StrictHostKeyChecking=no root@100.117.92.5 "
cd /docker/paperclip-ezk7/data/repos/otis/evals
# Patch BASE_PROF to use eval-direct profile
python3 bakeoff-v2.py --models 'deepseek-v4-flash,nemotron-3-nano:30b'
"
```

Note: bakeoff-v2.py clones the BASE_PROF (vera) and sources its .env — **this will hit LiteLLM** unless you
patch `BASE_PROF = '/opt/hermes-profiles/eval-direct'` at the top of the file first, or set it via env.

## Querying Langfuse for production data

Langfuse is at `https://langfuse-lugt.srv1724463.hstgr.cloud`. Credentials are in AWS SM.

```bash
# Get Langfuse credentials
LANGFUSE_SK=$(aws secretsmanager get-secret-value --secret-id agentos/langfuse/secret_key --region us-east-1 --query SecretString --output text 2>/dev/null)
LANGFUSE_PK=$(aws secretsmanager get-secret-value --secret-id agentos/langfuse/public_key --region us-east-1 --query SecretString --output text 2>/dev/null)

# Or get from LiteLLM config (it's a callback)
LITELLM_KEY="JKkw1Z0hc7HBsikGRNgz4RnOfqhefxCi"

# Query model distribution from Langfuse API
curl -s "https://langfuse-lugt.srv1724463.hstgr.cloud/api/public/metrics/daily" \
  -u "$LANGFUSE_PK:$LANGFUSE_SK" \
  -G --data-urlencode "fromTimestamp=2026-06-01T00:00:00Z"
```

## Candidate model list (as of 2026-06-15)

Ollama Cloud pricing tiers (Low < Medium < High by GPU cost):

| Model | Tier | Status | Notes |
|---|---|---|---|
| `gpt-oss:20b` | Low | **BROKEN** — empty content | Returns 0-length content, tokens generated but not returned (Ollama regression 2026-06-15) |
| `nemotron-3-nano:30b` | Low | **FAILS t6** — unreliable auth | Passed smoke test but failed eval harness; inconsistent curl behavior |
| `deepseek-v4-flash` | Medium | **PASS** — current `routine` | Was production model (61K obs May-Jun), passes t3/t5/t6 |
| `glm-5.1:cloud` | High | **PASS** — current `interactive` | Heavy model for Juno/Piper interactive sessions |
| `gemma4:31b` | ? | **DISQUALIFIED** — fails t6 | Self-sabotages on masked API keys |
| `ministral-3:14b` | ? | **DISQUALIFIED** — fails t6 | Same auth issue as gemma4 |

## Updating LiteLLM alias after eval

Once a new winner is confirmed, update the `routine` alias:

```bash
LITELLM_KEY="JKkw1Z0hc7HBsikGRNgz4RnOfqhefxCi"

# Get current routine model IDs
curl -s "http://srv1724463.hstgr.cloud:42171/model/info" \
  -H "Authorization: Bearer $LITELLM_KEY" | python3 -c "
import sys, json
for m in json.load(sys.stdin).get('data', []):
    if m.get('model_name') == 'routine':
        print(m['model_info']['id'], m['litellm_params']['model'])
"

# Delete old entries, add new ones
# POST /model/delete {"id": "<uuid>"}
# POST /model/new   {"model_name": "routine", "litellm_params": {"model": "openai/<new_model>", "litellm_credential_name": "ollama-kaleidoscope"}}
```

## Decision methodology (from CRITERIA.md)

1. Run via wrapper, never bare hermes — wrapper provides PAPERCLIP_API_KEY for t6
2. Read transcripts; don't trust keyword flags alone
3. Reliability matters: pass consistently across ≥2 runs, not just once
4. Cheapest-first: stop as soon as a model passes reliably; don't test up to Heavy tier if Medium works
5. t6_auth_secret is the hard discriminator — if it fails once in two runs, disqualified

## Current state summary (2026-06-16)

- `routine` alias: `deepseek-v4-flash` ✓ (Medium tier, confirmed passing) — kaleidoscope only (chrisabad removed: Free tier blocks Medium+)
- `interactive` alias: `glm-5.1:cloud` ✓ (High tier, Juno/Piper) — kaleidoscope only
- `gpt-oss:20b`: BROKEN on Ollama Cloud — recheck monthly when quota resets
- Hermes Langfuse plugin: DISABLED fleet-wide (LiteLLM→Langfuse is active)
- LiteLLM admin key: `JKkw1Z0hc7HBsikGRNgz4RnOfqhefxCi`
- Fleet routing: `OLLAMA_BASE_URL=http://srv1724463.hstgr.cloud:42171/v1` in all 11 profile `.env` files on 100.117.92.5
- chrisabad: needs Pro+ Ollama subscription before being added back to round-robin (~recheck 2026-06-21 after Free quota reset)
