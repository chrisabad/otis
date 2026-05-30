#!/usr/bin/env bash
# Build and deploy the kaleidoscope-issue-trigger plugin to the VPS.
# Usage: ./deploy.sh [--dry-run]
set -e

PLUGIN_DIR="$(cd "$(dirname "$0")" && pwd)"
VPS_USER=root
VPS_HOST=100.117.92.5
VPS_PATH=/docker/paperclip-ezk7/data/plugins/kaleidoscope-issue-trigger/dist/worker.js
SSH_KEY=~/.ssh/agentos_migration_2026-05-27

cd "$PLUGIN_DIR"

echo "==> Installing dependencies..."
npm install

echo "==> Building..."
npm run build

if [ "${1}" = "--dry-run" ]; then
  echo "==> Dry run — skipping deploy. Built artifact: dist/worker.js"
  exit 0
fi

echo "==> Deploying to VPS..."
scp -i "$SSH_KEY" -o StrictHostKeyChecking=no dist/worker.js "${VPS_USER}@${VPS_HOST}:${VPS_PATH}"

echo "==> Verifying plugin reloaded (touch triggers dev-watcher)..."
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "${VPS_USER}@${VPS_HOST}" \
  "touch ${VPS_PATH} && echo 'Plugin file updated on VPS'"

echo "==> Done. Verify in Paperclip logs: docker logs paperclip-ezk7-paperclip-1 --since 30s"
