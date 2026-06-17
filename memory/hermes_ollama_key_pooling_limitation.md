# Hermes Ollama credential pooling — limitation (2026-06-06)

## Goal
Pool both Ollama account keys (kaleidoscope + chrisabad) per agent via Hermes `credential_pool_strategies`
(round_robin/least_used) so load spreads across accounts + auto-failover when one hits its session limit.

## Hermes mechanism (what exists)
- Pool store: `HERMES_HOME/auth.json` → `credential_pool["ollama-cloud"]` = list of entries (id, label, source, secret_fingerprint, base_url...).
- `hermes auth add ollama-cloud --type api-key --api-key <K> --label <L>` adds a manual (source=manual) pool entry.
- `hermes auth list/remove`. Strategies in config.yaml `credential_pool_strategies: {ollama-cloud: round_robin}` (default = fill_first). Supports fill_first/round_robin/least_used/random.
- Provider registry (auth.py PROVIDER_REGISTRY): `ollama-cloud` has `api_key_env_vars=("OLLAMA_API_KEY",)` — ONE env var. Multi-env-var tuples (e.g. copilot) are FALLBACK chains, not multiple pool entries.

## THE BLOCKER (verified empirically)
**Per-issue Hermes runs REGENERATE credential_pool from env discovery, dropping manual (source=manual) entries.**
- Evidence: added chrisabad to all active agents (showed 2 creds). After a single run, ellis auth.json (mtime bumped) → back to 1 cred (env:OLLAMA_API_KEY only). juno-fon (27 runs/30m) reverts within seconds every time.
- Agents that DON'T run (inactive infra: dex, supervisor) KEEP manual creds — which is why those were the only ones with a pre-existing 2nd "chrisabad" cred. Active agents never had working pooling.
- Therefore manual-add pooling is incompatible with active execution. Env discovery yields ONE entry (single OLLAMA_API_KEY). No supported path to a durable 2-key pool for active agents without patching Hermes auth internals (/opt/hermes-venv site-packages — fragile, lost on hermes upgrade).

## DOCS vs DEPLOYED VERSION (checked the docs per Chris)
Docs (https://hermes-agent.nousresearch.com/docs/user-guide/features/credential-pools) say: manual `hermes auth add`
entries store a durable token (source=manual, access_token present) and are NEVER auto-pruned; only env-sourced entries
auto-prune. So pooling SHOULD persist.
**BUT deployed Hermes = v0.15.2 (2026.5.29.2) does NOT honor this.** Verified empirically: added chrisabad (manual,
has_token=True) to all 7 active agents → all showed 2. After 240s of normal runs: every agent whose auth.json a run
REWROTE (juno 20:19, ellis 20:20, juno-fon 20:20) dropped to 1 = env entry only (manual pruned); the 4 NOT rewritten
(axel/willa/tess/piper, mtime 20:03) kept 2. juno's pruned pool = [('OLLAMA_API_KEY','env:OLLAMA_API_KEY')].
=> Per-issue runs on 0.15.2 rebuild the pool from env discovery and drop manual entries (version gap or 0.15.2 bug).
=> Persistent multi-key pooling requires a Hermes UPGRADE to a version that honors manual-cred persistence.

## Achievable alternatives
1. Per-AGENT split: set some agents' .env OLLAMA_API_KEY=chrisabad, others=kaleidoscope. Survives runs (it's just the env key). Coarse load-spread across both accounts (per-agent, not per-request). chrisabad cancels 6/14 → temporary.
2. Single key (current): all agents on kaleidoscope (paid extra-usage). Works, healthy, == post-6/14 end state.
3. Real pooling later: Hermes upgrade with persistent pool, OR a pooling proxy in front of Ollama (note: old LiteLLM @ localhost:4000 was removed/dead-era), when there's a durable 2nd account.

## Current state (2026-06-06 ~20:10Z)
- All 13 profiles: env OLLAMA_API_KEY = kaleidoscope (...DeCEz5). chrisabad dependency removed (nothing breaks 6/14).
- Langfuse killed fleet-wide (creds removed from .env + config.yaml clean) — durable. Recovery breaker patch 059 live.
- Fleet HEALTHY: last 20m = 0 failures, 0 langfuse, 0 429; agents succeeding on paid kaleidoscope.
- Leftover harmless: round_robin in some config.yaml (no-op with 1 effective cred; live edits self-revert on deploy); manual creds on inactive infra agents.
- RUNAWAYS CONTAINED via langfuse-kill + breaker (the real cost-safety). Pooling was a nice-to-have, not the containment.
