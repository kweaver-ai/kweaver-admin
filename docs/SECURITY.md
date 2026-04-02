# Security

## Tokens

- Prefer `KWEAVER_ADMIN_TOKEN` for CI/headless usage; `KWEAVER_TOKEN` is supported as fallback.
- File-based admin token storage is isolated under `~/.kweaver-admin/platforms/` with restrictive permissions.
- Never print tokens in default output; `auth token` must warn that stdout is sensitive.

## OAuth2

Platform uses OAuth2 (e.g. Hydra): authorization code flow yields `access_token`, `id_token`, `refresh_token`. Refresh behavior should match platform docs.

## TLS insecure mode (dev only)

- CLI supports `-k` / `--insecure` to disable TLS certificate verification for the current process.
- Environment variable `KWEAVER_TLS_INSECURE=1` (or `true`) has the same effect.
- Implementation sets `NODE_TLS_REJECT_UNAUTHORIZED=0` when enabled.
- Never use this mode in production.

## Audit

Administrative actions are audited on the server; CLI should not bypass audit. Operators should use individual accounts, not shared admin passwords.

## Built-in accounts

Respect 三权分立 constraints for built-in accounts (`system`, `admin`, `security`, `audit`).
