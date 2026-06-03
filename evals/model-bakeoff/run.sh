#!/bin/bash
# Model bake-off runner — runs ON the VPS. Invokes each candidate model through
# an agent WRAPPER (so the real env incl. PAPERCLIP_API_KEY is present) on every
# task in tasks/. One transcript per (model,task) in results/. Latency in
# results/progress.log.
#
# Usage:  ./run.sh "glm-5.1 gpt-oss:20b deepseek-v4-flash"  [profile]
#   $1 = space-separated model list (required)
#   $2 = wrapper profile to borrow (default: vera)
#
# WHY a wrapper and not bare hermes: the key is exported by the wrapper, not the
# profile .env. Bare hermes + sourced .env yields a false 401 for every model.
set -u
MODELS="${1:?usage: run.sh \"model1 model2 ...\" [profile]}"
PROFILE="${2:-vera}"
WRAPPER="/opt/hermes-wrappers/${PROFILE}.sh"
HERMES_TIMEOUT=240
cd "$(dirname "$0")"
mkdir -p results
: > results/progress.log
[ -x "$WRAPPER" ] || { echo "no wrapper $WRAPPER" >&2; exit 1; }

for m in $MODELS; do
  safe=$(echo "$m" | tr ":/." "___")
  for tf in tasks/t*.txt; do
    t=$(basename "$tf" .txt)
    start=$(date +%s)
    timeout "$HERMES_TIMEOUT" "$WRAPPER" chat -q "$(cat "$tf")" -Q -m "$m" \
      --provider auto --yolo -t terminal > "results/out_${safe}__${t}.txt" 2>&1
    echo "$(date -u +%H:%M:%S) $m $t rc=$? lat=$(( $(date +%s)-start ))s" >> results/progress.log
  done
done
echo "ALL DONE" >> results/progress.log
echo "done — see results/"
