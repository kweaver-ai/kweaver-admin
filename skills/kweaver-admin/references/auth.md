# Auth Commands

This file reflects the current `kweaver-admin` implementation, not older SDK
or design-doc variants.

## Scope

Use for login/session/token/password operations.

## Commands

### `auth login [url]`

- `url` (optional): platform base URL.
- `--token <token>`: use static token directly (CI/headless).
- `--client-id <id>`: OAuth client id.
- `--client-secret <secret>`: OAuth client secret.
- `--port <n>`: local callback port for browser flow.
- `-u, --username <name>`: username for `/oauth2/signin` password flow.
- `-p, --password <password>`: password for `/oauth2/signin` password flow.
- `--signin-public-key-file <path>`: override RSA public key used to encrypt
  password for `/oauth2/signin`.
- `--no-browser`: avoid auto-opening browser.
- `--product <name>`: OAuth product query (default `adp`).

Behavior:

- Prefers interactive OAuth login by default.
- Saves tokens in `~/.kweaver-admin/`.
- Global `-k/--insecure` or env `KWEAVER_TLS_INSECURE=1` marks saved session as
  TLS-insecure for that platform.

Validation / constraints:

- `--no-browser` cannot be combined with `-u/-p`.
- `--port` must be `1..65535`.
- `--token` short-circuits OAuth and stores static token directly.

### `auth logout`

- Clears local token cache for current platform.
- If there is no active platform, CLI prints a warning instead of failing.

### `auth status`

- Shows token configured/expired status, base URL, TLS mode.
- If refresh token exists, expired token is marked as auto-refreshable.
- `--json` also includes saved business domain when available.

### `auth whoami [url]`

- Decodes identity from stored token/id token context.
- If `KWEAVER_BASE_URL` + `KWEAVER_TOKEN`/`KWEAVER_ADMIN_TOKEN` are set and no
  explicit `[url]` is passed, CLI prefers env credentials over saved
  `currentPlatform`.
- Env-only mode may expose less identity detail than saved `id_token` mode.

### `auth change-password [url]`

Self-service change of any EACP account's password (including the currently
logged-in admin's own password). Requires the **old password** — the
forgot-password / vcode flow is **not** supported by this CLI; use the web
console for password recovery.

- `-u, --account <name>`: account/login name. Optional when there is an
  active session — defaults to the `preferred_username` (fallback `name`)
  claim of the saved `id_token`.
- `-o, --old-password <password>`: old password. Prompted on TTY (hidden) if
  omitted.
- `-n, --new-password <password>`: new password. Prompted on TTY (hidden,
  twice with confirmation) if omitted.
- `--public-key-file <path>`: override RSA public key.

Validation / constraints:

- `--old-password` is always required (passed as flag or prompted on TTY).
- When `--account` is omitted, the current session must have a saved
  `id_token` exposing `preferred_username` or `name`; otherwise the CLI
  errors and asks the operator to either pass `-u` or run `auth login`.
- In `--json` or non-TTY mode, `--old-password` and `--new-password` must
  be provided as flags (no prompting).
- This command talks to EACP `/api/eacp/v1/auth1/modifypassword`; it does
  not require admin token auth.
- After a successful change, CLI prints a stderr reminder to re-run
  `auth login` with the new password.

### `auth token`

- Prints current access token to stdout.
- Sensitive output; do not log in shared channels.
- Warning is printed to stderr before token output.
