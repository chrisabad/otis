---
name: incident-lockdown-permissions-2026-06-16
description: AGE-775 lockdown-permissions.sh chown root:root bug — causes fleet-wide PermissionError on every CI deploy; fix pattern documented.
metadata: 
  node_type: memory
  type: project
  originSessionId: 77493503-f693-4bc5-90c7-fe460c44a9b5
---

Fleet-down incident: `lockdown-permissions.sh` (AGE-775 security feature) ran `chown root:root` on `.env` and `config.yaml` files, making them unreadable by the Hermes agent process (runs as `paperclip`/`node`, uid=1000 on host = `node` inside Docker container).

**Why:** AGE-775 wanted to prevent agents from modifying their own config. The `chown root:root` + `chmod go-w` approach was correct for wrapper scripts (agents only need execute), but broke `.env`/`config.yaml` which agents MUST read to start.

**Symptoms:** PermissionError storm immediately after a CI deploy, all agents failing within 2-9 seconds, dispatch-failure-monitor auto-pausing agents.

**Error in logs:**
```
PermissionError: [Errno 13] Permission denied: '/opt/hermes-profiles/<agent>/.env'
```

**Durable fix:** agentos-config PR #264 — `lock_path_agent_readable()` in `lockdown-permissions.sh` uses `chown paperclip:paperclip` + `chmod a-w` for `.env` and `config.yaml`. Wrapper scripts stay `root:root`.

**Post-fix state:** `.env` files should be `440 paperclip:paperclip` (read-only, owned by agent user). Check with `stat -c '%a %U:%G' /opt/hermes-profiles/*/.env`.

**How to apply:** If fleet fails immediately after a CI deploy with PermissionError: `ssh root@100.117.92.5 "chown paperclip:paperclip /opt/hermes-profiles/*/.env"` then unpause agents via Paperclip API.
