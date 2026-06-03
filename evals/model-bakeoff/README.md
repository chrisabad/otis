# Model Bake-off — AGE fleet LLM evaluation

Reusable harness for choosing which Ollama Cloud model(s) to run agents on.
Re-run this whenever a new model ships or when a model's behavior is in question.

## The one rule that matters

**Evaluate THROUGH the real Hermes harness, never via direct Ollama API calls.**

Direct `/api/chat` or `/v1` calls have repeatedly produced *misleading* results:
a model that looks fine on a bare API call can fail in the harness (and vice
versa) because of the agent system prompt, tool loop, streaming, and the
wrapper's env. Every conclusion in this repo's history that came from direct
API was wrong or incomplete. Run via the agent **wrapper** so the real
environment (incl. `PAPERCLIP_API_KEY`) is present.

## How to run

From a machine on the Tailnet with VPS SSH (see CLAUDE.md for key):

```bash
# 1. copy this dir to the VPS
scp -i <key> -r evals/model-bakeoff root@100.117.92.5:/tmp/

# 2. run (defaults: profile=vera, the candidate list in run.sh)
ssh -i <key> root@100.117.92.5 'cd /tmp/model-bakeoff && ./run.sh "glm-5.1 gpt-oss:20b deepseek-v4-flash"'

# 3. pull results + score
scp -i <key> -r root@100.117.92.5:/tmp/model-bakeoff/results ./evals/model-bakeoff/
python3 evals/model-bakeoff/score.py evals/model-bakeoff/results
```

`run.sh` invokes each model through `/opt/hermes-wrappers/<profile>.sh` (so the
real key/env is present), one transcript per (model,task) in `results/`, with
latency in `results/progress.log`.

## Adding a criterion

Drop a new `tasks/tN_<name>.txt` prompt and add a scoring block for it in
`score.py` (`flags()`), keyed by the `tN` token. That's it — `run.sh` picks up
any `tasks/*.txt` automatically. Document the new criterion in `CRITERIA.md`.

## Scoring

`score.py` emits automated pass/fail flags **and** marks cells that need a human
read. Automated flags are a *first pass only* — always read the transcripts of
the top candidates on the discriminating tasks (review, investigation). Keyword
heuristics have produced both false passes and false fails; the transcript is
ground truth.
