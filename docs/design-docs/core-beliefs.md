# Core beliefs

1. **Single-purpose commands** — Each subcommand does one job; names are predictable (`list`, `get`, `create`).
2. **Scriptable** — `--json` output for automation; stable field names for stable scripts.
3. **Fail fast** — Clear errors on missing auth, 4xx/5xx from API, or invalid flags.
4. **No secret leakage** — Tokens never appear in logs or stdout except where explicitly intended (e.g. `auth token` with warnings).
5. **Idempotent where possible** — Document when operations are not idempotent (e.g. create user).
