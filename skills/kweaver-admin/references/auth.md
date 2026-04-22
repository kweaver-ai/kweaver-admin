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

- Shows current user identity for the saved (or env) session.
- Username resolution chain (first hit wins):
  1. `id_token` claim (`preferred_username` / `name`)
  2. `access_token` claim (same fields)
  3. Persisted login name on the saved token (`token.username`, written by
     `-u/-p` login or by previous `whoami` lookups)
  4. `GET /api/eacp/v1/user/get` with `Authorization: Bearer <access_token>`
     (matches `kweaver-sdk` behavior; returns `account` / `name` / `mail`)
  5. `GET /api/user-management/v1/users/<sub>/account?role=...` public
     endpoint as a fallback for deployments where EACP `user/get` is
     blocked by the per-product client filter (HTTP 401 from
     `ncEACUserHandler`).
- A successful backend lookup is **persisted back** to the token file so
  later commands (`auth list`, `change-password`, …) read it locally
  without another HTTP round-trip.
- `--no-lookup`: skip the backend HTTP fallbacks (steps 4 and 5).
- If `KWEAVER_BASE_URL` + `KWEAVER_TOKEN`/`KWEAVER_ADMIN_TOKEN` are set and
  no explicit `[url]` is passed, CLI prefers env credentials over saved
  `currentPlatform`.
- `--json` includes `username` and `usernameSource`
  (`id_token` / `access_token` / `persisted` / `eacp/user/get` /
  `user-management/users`) plus the raw decoded payload for debugging.
- Successful login (`auth login`, both browser and `-u/-p` flows) also
  performs the same lookup once and persists the result, so the very
  first `whoami` after login is usually a no-op locally.

### `auth list` (alias `auth ls`)

- Lists every platform that has a saved session under
  `~/.kweaver-admin/platforms/<base64url(url)>/token.json`.
- For each platform shows: active marker (`*` for current), platform URL,
  user label, token status (`valid` / `expired` /
  `expired (refreshable)` / `no-expiry`), expires ISO timestamp, and
  `tls:insecure` flag when applicable.
- User label resolution:
  1. JWT `preferred_username` / `name` from `id_token`
  2. Persisted `token.username` (set at login or by `auth whoami`)
  3. `uid:<sub UUID>` when only the `sub` claim is present
  4. `(unknown — token has no username/sub claim; pass -u to commands)`
     when nothing decodes
- Status semantics:
  - `valid`: `expiresAt` is in the future.
  - `expired`: `expiresAt` is in the past. Reports `(refreshable)` when a
    `refresh_token` is stored — the next API call will silently refresh.
  - `no-expiry`: token has no `expiresAt` (e.g. opaque static token from
    `auth login --token`).
- `--json`: `{ currentPlatform: string|null, platforms: PlatformEntry[] }`
  where each entry is
  `{ platform, active, username?, userId?, issuer?, expiresAt?, status, refreshable, tlsInsecure }`.
- Read-only; does not contact any backend. Stale folders without a readable
  `token.json` are skipped silently.

### `auth change-password [url]`

Self-service change of any EACP account's password (including the currently
logged-in admin's own password). Requires the **old password** — the
forgot-password / vcode flow is **not** supported by this CLI; use the web
console for password recovery.

- `-u, --account <name>`: account/login name. Optional when there is an
  active session — defaults to the resolution chain used by `auth whoami`
  (`id_token` claim → `access_token` claim → persisted `token.username`).
  Backend lookup at change-password time is **not** attempted; if the
  chain yields nothing the CLI errors and asks the operator to either
  pass `-u` or run `auth whoami` first (which persists the resolved name).
- `-o, --old-password <password>`: old password. Prompted on TTY (hidden) if
  omitted.
- `-n, --new-password <password>`: new password. Prompted on TTY (hidden,
  twice with confirmation) if omitted.
- `--public-key-file <path>`: override RSA public key.

Validation / constraints:

- `--old-password` is always required (passed as flag or prompted on TTY).
- When `--account` is omitted, the resolution chain above must yield a
  login name; otherwise the CLI errors with a hint to pass `-u`.
- In `--json` or non-TTY mode, `--old-password` and `--new-password` must
  be provided as flags (no prompting).
- This command talks to EACP `/api/eacp/v1/auth1/modifypassword`; it does
  not require admin token auth.
- The fetch honors the saved platform's `tlsInsecure` flag (or the global
  `-k/--insecure` / `KWEAVER_TLS_INSECURE`), so self-signed-cert
  deployments work without extra plumbing.
- Network errors are surfaced via `formatFetchFailure`, which unwraps
  `error.cause` (e.g. `self signed certificate`, `ECONNREFUSED`).
- After a successful change, CLI prints a stderr reminder
  `Next time you log in, use the new password.` It does **not** invalidate
  the locally saved access_token; only the next `auth login` (with the
  new password) replaces it. Refresh tokens may be revoked server-side
  depending on backend policy.

### `auth token`

- Prints current access token to stdout.
- Sensitive output; do not log in shared channels.
- Warning is printed to stderr before token output.
