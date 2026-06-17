---
name: honcho-fleet-config-fix
description: Fleet Honcho honcho.json config fix (2026-06-17) — root cause HERMES_HONCHO_HOST URL key mismatch; all 10 agents now correctly identified
metadata: 
  node_type: memory
  type: project
  originSessionId: 30b87b41-d6a5-41f3-adde-75a37208f847
---

Fleet Honcho was silently broken for all 10 agents until 2026-06-17. Three compounding issues fixed.

**Root cause:** `HERMES_HONCHO_HOST` is set to the Honcho server URL in every agent's `.env`. This env var is used as a **host-key selector** (to pick which block in `hosts: {}` to read), not a URL. Since no `hosts` key matches the URL string, the host block was always `{}` — meaning `peerName`, `workspace`, and `aiPeer` from the nested `hosts.hermes` block were never read.

**Fix applied (2026-06-17):** Added root-level `peerName`, `workspace: "Agentos"`, and `aiPeer: "hermes"` to all 10 `honcho.json` files on the VPS. These fields are read via `raw.get("peerName")` fallback when the host block is empty.

**Durability:** `honcho.json` is NOT managed by CI (deploy workflow only syncs `config.yaml`, `SOUL.md`, `AGENTS.md`, `HEARTBEAT.md`, `TOOLS.md`). Changes persist across deploys.

**Additional fixes in same session:**
- Wrong peerNames in `hosts.hermes` block fixed: piper had "juno", tess had "ellis", willa had "axel"
- Created `honcho.json` for hollis, morgan, and nell (had none — would have failed silently)

**Side note:** `dialecticCadence: 0` means "run every turn" (not disabled) — `(turns - last) < 0` is always false for positive turn counts. The earlier assumption that fleet agents had dialectic disabled was wrong.

**Residual contamination:** Before this fix, piper's sessions were attributed to "juno", tess's to "ellis", willa's to "axel" in the Honcho DB. That historical data can't be retroactively re-attributed.

**How to apply:** When debugging Honcho peer attribution in future, check root-level `peerName` in honcho.json first. The nested `hosts.*` blocks only matter if `HERMES_HONCHO_HOST` is changed to a non-URL string.
