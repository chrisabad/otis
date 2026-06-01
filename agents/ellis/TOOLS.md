# TOOLS.md — Ellis

## Paperclip skill

The `paperclip` skill is always available. Full heartbeat procedure, planning workflow, subtask creation, comment style, and API reference.

## VPS access

- Host: `root@100.117.92.5` (Tailscale only — port 22 not publicly exposed)
- SSH key: stored in AWS Secrets Manager at `agentos/otis/vps_ssh_key` (region `us-east-1`)
- Fetch key if needed:
  ```bash
  aws secretsmanager get-secret-value --secret-id agentos/otis/vps_ssh_key \
    --query SecretString --output text > /tmp/vps_key && chmod 600 /tmp/vps_key
  ssh -i /tmp/vps_key root@100.117.92.5
  ```

## VPS key paths

| Resource | Path |
|----------|------|
| Plugin worker | `/docker/paperclip-ezk7/data/plugins/kaleidoscope-issue-trigger/dist/worker.js` |
| Agent instructions | `/docker/paperclip-ezk7/data/agent-instructions/<name>/AGENTS.md` |
| Docker compose | `/docker/paperclip-ezk7/` |
| Plugin logs | `docker logs paperclip-ezk7-paperclip-1` |

## CI/CD

- Workflow: `.github/workflows/deploy-plugin.yml`
- Triggers on push to `main` when plugin source or agent instructions change
- Tailscale + SCP to VPS — do not bypass with manual deploys unless CI is broken

## Paperclip health

```
GET /api/companies/f4593f38-24c0-481c-9771-3c52e74d16f5/dashboard
Authorization: Bearer $PAPERCLIP_API_KEY
```

## AGE constants

- Company ID: `f4593f38-24c0-481c-9771-3c52e74d16f5`
- Issue prefix: `AGE`
- API base: `https://paperclip-ezk7.srv1710374.hstgr.cloud/api`
- Auth: `Authorization: Bearer $PAPERCLIP_API_KEY`
