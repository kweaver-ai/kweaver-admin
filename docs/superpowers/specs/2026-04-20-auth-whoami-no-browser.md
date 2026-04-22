# Auth: `whoami` and `--no-browser` paste-code login

> **Date:** 2026-04-20  
> **Status:** Implemented  
> **Reference:** Aligns with `kweaver-sdk` (`packages/typescript/src/commands/auth.ts`, `auth/oauth.ts`).

---

## Summary

- **`kweaver-admin auth whoami [url]`** — Decodes identity for display. **Platform resolution** (which host labels the output and, for the file path, which `token.json` to read) is, in order:
  1. **Explicit `[url]`** on the command line (normalized, trailing `/` stripped).
  2. **Env-only pair** — if **both** are set, this wins over saved `currentPlatform`: `KWEAVER_BASE_URL` *or* `KWEAVER_API_URL`, **and** `KWEAVER_ADMIN_TOKEN` *or* `KWEAVER_TOKEN` (after trim). The CLI then decodes identity from the **access token** only (see below), not from the saved `id_token` file.
  3. **`~/.kweaver-admin/state.json` `currentPlatform`** when no explicit URL and no complete env pair.
  4. If no platform can be resolved, exit with `No active platform...`.

  **Incomplete env (only base URL, or only token):** not treated as env-only; resolution falls back to `currentPlatform` if present (same as having no env for `whoami`).

  **Identity source when not env-only:** prefer JWT payload from saved **`id_token`** (OAuth login). If there is no saved token file, no `id_token`, or decode fails, the command errors with a clear message.

  **Env-only path:** `decodeJwtPayload` on the access token. If the token is opaque (not a JWT), the CLI still prints the platform and `User info unavailable: opaque access token.` plus a hint to run `auth login` for a full session.

  Does not use the global `--base-url` flag or `config.json` for `auth whoami` **platform** selection (same rationale as SDK: avoid conflating an API override with the credential store key for “who is this session”).

- **`kweaver-admin auth login ... --no-browser`** — Prints `/oauth2/auth` URL and prompts on stderr for pasted callback URL or raw `code`; exchanges via `POST /oauth2/token` with PKCE when applicable. Skips local callback server entirely.
- **Mutex:** `--no-browser` cannot be combined with `-u/-p` (HTTP sign-in is already headless).
- **Commander:** `--no-browser` may appear as `noBrowser: true` or `browser: false`; `isNoBrowserLogin()` handles both.

---

## Files

| File | Change |
|------|--------|
| [src/lib/jwt.ts](../../src/lib/jwt.ts) | `decodeJwtPayload`, `extractUserIdFromJwt` (SDK port) |
| [src/lib/oauth.ts](../../src/lib/oauth.ts) | `promptForCode`, `stderrEmphasis` |
| [src/commands/auth.ts](../../src/commands/auth.ts) | `whoami`, `--no-browser` paste flow, mutex |

---

## Verification

```bash
npm run build
./dist/index.js auth whoami
./dist/index.js --json auth whoami
./dist/index.js auth login https://<host>/ --no-browser -k
# Paste full callback URL or code when prompted
```
