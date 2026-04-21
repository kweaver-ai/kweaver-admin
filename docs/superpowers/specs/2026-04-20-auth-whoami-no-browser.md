# Auth: `whoami` and `--no-browser` paste-code login

> **Date:** 2026-04-20  
> **Status:** Implemented  
> **Reference:** Aligns with `kweaver-sdk` (`packages/typescript/src/commands/auth.ts`, `auth/oauth.ts`).

---

## Summary

- **`kweaver-admin auth whoami [url]`** — Decodes identity from the saved `id_token` (JWT payload, no signature verification). Platform resolution: explicit `[url]` → `~/.kweaver-admin/state.json` `currentPlatform` → env-only (`KWEAVER_BASE_URL` or `KWEAVER_API_URL` + `KWEAVER_ADMIN_TOKEN` / `KWEAVER_TOKEN`). Does not use `--base-url` global or `config.json` for platform selection (same rationale as SDK: avoid conflating API override with credential store key).
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
