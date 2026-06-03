#!/usr/bin/env bash
# ensure-all-companies-gate.sh  (G1 — per-business execution-policy gate auto-provisioning)
#
# Ensures EVERY Paperclip company has a default_execution_policy (review→approval),
# so newly-created issues inherit the anti-phantom-completion gate via patch 053.
# Unlike the legacy ensure-companies-* script, this is:
#   - CURRENT: embedded-postgres connection (docker exec, socket /tmp:54329), post-migration
#   - PER-COMPANY: each company's gate uses ITS OWN qa-role agent (reviewer) + ceo-role
#     agent (approver) — never AGE's agents, never a self-rubber-stamp
#   - IDEMPOTENT: only touches companies whose policy has 0 stages
#   - SAFE: skips (and logs) companies that lack a distinct qa+ceo pair (can't form a
#     non-self gate yet — e.g. a freshly-created company with one agent)
#
# A company is gate-ready only once it has at least: 1 qa agent + 1 ceo agent + ≥1
# worker. Provision those agents BEFORE expecting a gate (see the onboarding runbook).
#
# Usage (from the VPS host):
#   ./ensure-all-companies-gate.sh            # apply
#   ./ensure-all-companies-gate.sh --dry-run  # report only, no writes
#
# DEPLOY WIRING (TODO — needs a PR to agentos-config, blocked on review approval):
#   add a call to this from paperclip-patches/start-paperclip.sh so it runs every deploy.

set -euo pipefail
CONTAINER="${PAPERCLIP_CONTAINER:-paperclip-ezk7-paperclip-1}"
DRY="${1:-}"

pq() { docker exec -e PGPASSWORD=paperclip "$CONTAINER" \
  psql -h /tmp -p 54329 -U paperclip -d paperclip -v ON_ERROR_STOP=1 "$@"; }

echo "=== Execution-policy gate provisioning (all companies) ==="
pq -c "ALTER TABLE companies ADD COLUMN IF NOT EXISTS default_execution_policy jsonb;" >/dev/null

echo "--- companies needing a gate ---"
pq -tAc "SELECT c.name FROM companies c WHERE COALESCE(jsonb_array_length(c.default_execution_policy->'stages'),0)=0;"

echo "--- SKIPPED (no distinct qa+ceo pair — provision agents first) ---"
pq -tAc "
SELECT c.name
FROM companies c
WHERE COALESCE(jsonb_array_length(c.default_execution_policy->'stages'),0)=0
  AND ( (SELECT a.id FROM agents a WHERE a.company_id=c.id AND a.role='qa'  LIMIT 1) IS NULL
     OR (SELECT a.id FROM agents a WHERE a.company_id=c.id AND a.role='ceo' LIMIT 1) IS NULL );"

if [ "$DRY" = "--dry-run" ]; then echo "(dry-run: no writes)"; else
pq -c "
WITH picks AS (
  SELECT c.id AS company_id,
    (SELECT a.id FROM agents a WHERE a.company_id=c.id AND a.role='qa'  ORDER BY a.name LIMIT 1) AS reviewer,
    (SELECT a.id FROM agents a WHERE a.company_id=c.id AND a.role='ceo' ORDER BY a.name LIMIT 1) AS approver
  FROM companies c
  WHERE COALESCE(jsonb_array_length(c.default_execution_policy->'stages'),0)=0
)
UPDATE companies c SET
  default_execution_policy = jsonb_build_object(
    'mode','normal','commentRequired',true,'planRequired',false,
    'stages', jsonb_build_array(
      jsonb_build_object('id',gen_random_uuid()::text,'type','review','approvalsNeeded',1,
        'participants',jsonb_build_array(jsonb_build_object('id',gen_random_uuid()::text,'type','agent','agentId',p.reviewer,'userId',null))),
      jsonb_build_object('id',gen_random_uuid()::text,'type','approval','approvalsNeeded',1,
        'participants',jsonb_build_array(jsonb_build_object('id',gen_random_uuid()::text,'type','agent','agentId',p.approver,'userId',null)))
    )),
  updated_at=NOW()
FROM picks p
WHERE c.id=p.company_id AND p.reviewer IS NOT NULL AND p.approver IS NOT NULL AND p.reviewer<>p.approver;"
fi

echo "--- final gate state ---"
pq -tAc "SELECT c.name || ': ' || COALESCE(jsonb_array_length(c.default_execution_policy->'stages'),0) || ' stages' FROM companies c ORDER BY c.name;"
