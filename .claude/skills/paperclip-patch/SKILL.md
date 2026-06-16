---
name: paperclip-patch
description: Create, apply, and manage durable patches for the Paperclip server (@paperclipai packages). Use when modifying Paperclip server behavior, fixing bugs in @paperclipai dist/ files, patching heartbeat/scheduler/retry logic, or when "paperclip patch" is mentioned. NEVER edit files in ~/.npm/_npx/ directly — all changes must go through the patch system at ~/.paperclip/patches/. Also use when updating Paperclip to a new version (patches must be reapplied).
version: 1.0.0
audience: agent-only
agents: [otis]
---
# Paperclip Patch

Paperclip runs via `npx paperclipai@<version>` cached in `~/.npm/_npx/`. Direct edits to that cache are lost on version updates. This skill enforces durable patches.

## Critical Rule

**NEVER edit files under `~/.npm/_npx/` directly.** All Paperclip modifications go through `~/.paperclip/patches/`. Direct edits are silent data loss.

## Patch Format

Each patch is a `.patch` file in `~/.paperclip/patches/` using MATCH/REPLACE format:

```
--- Paperclip patch: short-name
--- Target: @paperclipai/server/dist/path/to/file.js
--- Purpose: Why this patch exists

MATCH:
<exact text to find in the target file>

REPLACE:
<replacement text>
```

- `Target` is relative to `node_modules/` in the npx cache
- `MATCH` must be unique in the target file — include enough surrounding context
- `REPLACE` should include a `(patched)` comment so patches are visually identifiable

## Creating a New Patch

1. Identify the file to patch. Find it in the active npx cache:
   ```bash
   ~/.paperclip/patches/apply-patches.sh --version   # shows active cache path
   ```

2. Read the target file to find the exact text to match.

3. Determine the next patch number:
   ```bash
   ls ~/.paperclip/patches/*.patch | tail -1   # highest existing number
   ```

4. Write the patch file at `~/.paperclip/patches/NNN-description.patch`.

5. Apply and verify:
   ```bash
   ~/.paperclip/patches/apply-patches.sh
   ```

6. Update the patch table in `~/.claude/projects/-Users-hermes/CLAUDE.md` under the "### Current patches" section — add a row with the patch number, name, target, and purpose.

7. Restart Paperclip (maintenance window required):
   ```bash
   launchctl kickstart -k gui/$(id -u)/com.paperclipai.server
   ```

## Checking Patch Status

```bash
~/.paperclip/patches/apply-patches.sh --check    # dry-run: OK / NEED / FAIL per patch
~/.paperclip/patches/apply-patches.sh --version   # show active Paperclip version + cache path
```

## Applying Patches

```bash
~/.paperclip/patches/apply-patches.sh   # idempotent — skips already-applied patches
```

Output per patch:
- `OK` — already applied
- `DONE` — just applied
- `FAIL` — MATCH text not found (patch may be incompatible with current version)
- `SKIP` — malformed patch file

## After a Paperclip Version Update

1. Update the version in `~/Library/LaunchAgents/com.paperclipai.server.plist`
2. Populate the npx cache: `npx paperclipai@<new-version> --help`
3. Run `~/.paperclip/patches/apply-patches.sh`
4. Fix any `FAIL` results — the MATCH text may have changed upstream. Read the new file version, update the MATCH block, and re-run.
5. Restart: `launchctl kickstart -k gui/$(id -u)/com.paperclipai.server`
