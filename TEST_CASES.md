# kweaver-admin 0.6.0 - Manual Test Cases

End-to-end smoke/regression checklist for `kweaver-admin` against a live
ISF deployment. Run in order; each section assumes the previous one passed.

## Conventions

Pick one of the three install paths below; the rest of the matrix invokes
the CLI as `KA <subcommand> ...`.

> Use `alias`, not `KA="node /path/to/index.js"` variable form.
> In zsh, `$KA --version` does not split words like bash, so it fails with
> `no such file or directory: node /path/...`.

```bash
# (A) Published npm package - main release path
npm install -g @kweaver-ai/kweaver-admin
alias KA="kweaver-admin"

# (B) One-shot via npx (no global install)
alias KA="npx -y @kweaver-ai/kweaver-admin"

# (C) Local build from source - pre-release/candidate verification
git clone https://github.com/kweaver-ai/kweaver-admin.git
cd kweaver-admin
npm ci
npm run build
alias KA="node $(pwd)/dist/index.js"
# or `npm link` once, then: alias KA="kweaver-admin"

# Optional global flags used in the matrix:
#   -k / --insecure              skip TLS verification (or KWEAVER_TLS_INSECURE=1)
#   --base-url <url>             override target platform for one invocation
#   --json                       JSON output (also accepted per-subcommand)
```

> Replace `<root-id>`, `<userId>`, `<roleId>`, `<new-id>`, `<new-org-id>`,
> `<child-id>` with values captured from earlier steps.

Capture results inline (YES/NO/N/A) and anomalies. Keep destructive sections
(2 / 4 / 6 / 9) self-cleaning.

---

## 0. Smoke

| # | Command | Expectation |
|---|---|---|
| 0.1 | `KA --version` | `0.6.0` |
| 0.2 | `KA --help` | Commands list contains `auth / org / user / role / llm / small-model / audit / config / call` (9 entries) |
| 0.3 | `KA auth status` | `Token: configured`, `Expires:` line; expired token shows `EXPIRED - auto-refresh on next API call` (or `... run \`auth login\` to renew` when no refresh token) |
| 0.4 | `KA auth whoami` | Prints `Platform / User ID / Issuer / Session / Issued / Expires` |
| 0.5 | `KA auth token` | Stderr safety warning + access_token on stdout |
| 0.6 | `KA config show` | JSON containing `baseUrl` |

## 1. Read-only matrix (org / role / user / audit / llm / small-model)

| # | Command | Expectation |
|---|---|---|
| 1.1 | `KA org list` | Table, >=1 row, `(N/M)` count |
| 1.2 | `KA org list --json` | JSON `entries[]` |
| 1.3 | `KA org tree` | Tree-shaped output |
| 1.4 | `KA org get <root-id>` | JSON dept detail incl. `parentPath / managerID / code / status / remark` (thrift route) |
| 1.5 | `KA org get -- -1` | Exercises `-1` arg via `--`; on some deployments may return ShareMgnt errID=99, then use real root id from `org list --json` (`entries[0].id`) and run `org get <root-id>` |
| 1.6 | `KA org members <root-id>` | User table |
| 1.7 | `KA role list` | 3 roles: ????? / AI??? / ????? |
| 1.8 | `KA role get <roleId>` | JSON role detail incl. `resource_type_scopes` |
| 1.9 | `KA role members <roleId>` | Member table |
| 1.10 | `KA user list` | Table headers: `ID / ACCOUNT / DISPLAY NAME / EMAIL / ENABLED` |
| 1.11 | `KA user list --keyword test` | Only matching usernames |
| 1.12 | `KA user list --json --limit 5 --offset 0` | JSON, <=5 entries |
| 1.13 | `KA user get <userId>` | Full thrift `Usrm_GetUserInfo` payload (`user / originalPwd / directDeptInfo`) |
| 1.14 | `KA user roles <userId>` | Table; empty -> `User X has no roles assigned.` |
| 1.15 | `KA user roles <userId> --json` | JSON, `route: "fallback:list-roles+role-members"` |
| 1.16 | `KA audit list --size 3` | May time out (~60 s) on this deployment; expect friendly hint about login-log |
| 1.17 | `KA llm list` | Table, >=1 row (DeepSeek-V3.2) |
| 1.18 | `KA llm get <name>` | JSON detail |
| 1.19 | `KA small-model list` | Table or `No small models configured.` |

## 2. user write loop (creates and removes a temporary account)

```bash
LOGIN="cli-test-$(date +%s)"
```

| # | Command | Expectation |
|---|---|---|
| 2.1 | `KA user create --login $LOGIN --json` | Returns `id / loginName / initialPassword:"123456" / mustChangeOnFirstLogin:true` |
| 2.2 | `KA user list --keyword $LOGIN` | New user appears |
| 2.3 | `KA user get <new-id>` | Thrift returns full profile |
| 2.4 | `KA user update <new-id> --display-name "CLI Test" --email a@b.com --remark "smoke" --json` | `route: "rest"` |
| 2.5 | `KA user get <new-id>` | `displayName / email / remark` reflect the update |
| 2.6 | `KA user reset-password -u $LOGIN` | Defaults to `123456`, requires confirmation |
| 2.7 | `KA user reset-password -u $LOGIN -p NewPwd@123` | Sets a known password after confirm |
| 2.8 | `KA user reset-password -u $LOGIN --prompt-password` | Hidden interactive input twice |
| 2.9 | `KA user reset-password -u $LOGIN -p A --prompt-password` | Mutex check: error + non-zero exit |
| 2.10 | `KA user reset-password --id <new-id> --json` | JSON success payload |
| 2.11 | (separate shell) `KA auth login` with the new password -> `auth whoami` -> `auth logout` and switch back to admin | Confirms password actually changed |
| 2.12 | `KA user delete <new-id>` | Confirmation prompt; afterwards `user list --keyword $LOGIN` returns empty |

## 3. role + user-role roundtrip

| # | Command | Expectation |
|---|---|---|
| 3.1 | `KA user roles <new-id>` | Empty |
| 3.2 | `KA user assign-role <new-id> <roleId>` | Green success message |
| 3.3 | `KA user roles <new-id>` | One row containing the role |
| 3.4 | `KA role members <roleId>` | Includes `<new-id>` |
| 3.5 | `KA role add-member <roleId> --user <other-id>` | Success (or batch via repeated `--user`) |
| 3.6 | `KA role remove-member <roleId> --user <other-id>` | Success |
| 3.7 | `KA user revoke-role <new-id> <roleId>` | Success |
| 3.8 | `KA user roles <new-id>` | Empty again |

## 4. org write loop (creates and removes temporary departments)

```bash
OG="cli-test-org-$(date +%s)"
```

| # | Command | Expectation |
|---|---|---|
| 4.1 | `KA org create --name $OG --json` | Returns new `id` (thrift `Usrm_AddDepartment`) |
| 4.2 | `KA org create --name "$OG-child" --parent <new-org-id> --remark "smoke"` | Child department created |
| 4.3 | `KA org tree` | Both new nodes visible |
| 4.4 | `KA org get <new-org-id>` | Department detail returned |
| 4.5 | `KA org update <new-org-id> --name "${OG}-renamed" --remark "updated" --json` | `route: "shareMgnt"` |
| 4.6 | `KA org get <new-org-id>` | Name reflects update |
| 4.7 | `KA org delete <child-id>` (confirm) | Child removed |
| 4.8 | `KA org delete <new-org-id>` (confirm) | Parent removed |
| 4.9 | `KA org list` | No remaining `cli-test-*` |

## 5. call passthrough

| # | Command | Expectation |
|---|---|---|
| 5.1 | `KA call /api/authorization/v1/roles -X GET` | JSON `entries[]` |
| 5.2 | `KA call /api/authorization/v1/roles -X GET --no-pretty` | Compact single-line JSON |
| 5.3 | `KA call "/api/user-management/v1/console/search-users/account?account=admin"` | Search match |
| 5.4 | `KA call /isfweb/api/ShareMgnt/Usrm_GetUserInfo -X POST -d '["<adminId>"]'` | Thrift returns full object |
| 5.5 | `KA call /api/foo/bar -v` | Stderr shows method / url / headers |
| 5.6 | `KA call --help` | Full curl-style help |

## 6. auth lifecycle (mutates local token cache - switch back to admin afterwards)

| # | Command | Expectation |
|---|---|---|
| 6.1 | `KA auth login --base-url https://<your-platform> -k` | Browser callback or device-code flow completes |
| 6.2 | `KA auth status` | `Token: configured / Expires` recent |
| 6.3 | `KA auth change-password` (logged in) | `-u` defaults to current session; three hidden prompts (old / new / confirm); use a throwaway account |
| 6.3a | `KA auth change-password -u other-account -o ... -n ...` | Targets a different account; non-interactive form |
| 6.3b | `KA auth change-password --json` (no `-o/-n`) | Errors out: `--old-password` / `--new-password` required in non-interactive / --json mode |
| 6.3c | `KA auth logout && KA auth change-password` | Errors out: cannot determine account (no session); hint suggests `-u` or `auth login` |
| 6.4 | `KA auth logout` | Local token cleared; `auth status` shows `Token: not configured` |
| 6.5 | `KA auth login` again | State restored |

## 6B. `auth whoami` precedence (env vs saved session)

Assumes a normal `auth login` first so `~/.kweaver-admin/state.json` has a
`currentPlatform` that may differ from any env URL you set below. Unset env
vars between rows if a case says “cleared”.

| # | Command | Expectation |
|---|---|---|
| 6B.1 | `KA auth whoami` (no extra env) | Identity from saved `id_token`; `Platform:` matches the platform you logged into |
| 6B.2 | `KWEAVER_BASE_URL=https://<env-host>/ KWEAVER_ADMIN_TOKEN=<tok> KA auth whoami` (saved `currentPlatform` is a *different* host) | `Source: env`; `Platform:` is **env** URL (env pair overrides saved session) |
| 6B.3 | Same env vars as 6B.2 + `KA auth whoami https://<explicit-host>/` | `Platform:` is **explicit** URL (beats env + saved) |
| 6B.4 | `KWEAVER_BASE_URL=https://<x>/` only (no token), token env vars cleared, saved session present | Not env-only; falls back to saved platform — `Source:` line absent (file `id_token` path) |
| 6B.5 | `KWEAVER_ADMIN_TOKEN=<tok>` only (no base URL env), base URL env vars cleared, saved session present | Not env-only; falls back to saved platform |
| 6B.6 | Full env pair + opaque / non-JWT access token | `User info unavailable: opaque access token.` + hint to run `auth login` |
| 6B.7 | Full env pair + `KA --json auth whoami` | JSON includes `"source":"env"` |
| 6B.8 | `KA auth logout` then `KWEAVER_BASE_URL=... KWEAVER_ADMIN_TOKEN=... KA auth whoami` | Still succeeds (env-only); `Source: env` |
| 6B.9 | `KA auth logout`, env token vars cleared, no `KWEAVER_BASE_URL` pair | `auth whoami` exits non-zero (`No active platform` or no token, depending on state) |

## 7. Global flags

| # | Command | Expectation |
|---|---|---|
| 7.1 | `KA --json user list` | JSON output (global flag mirrors per-subcommand `--json`) |
| 7.2 | `KA -k --base-url https://<your-platform> org list` | Ad-hoc base url + insecure mode |
| 7.3 | `KWEAVER_TLS_INSECURE=1 KA org list` | Env var path |
| 7.4 | `KWEAVER_ADMIN_TOKEN=<token> KA --base-url https://... user list` | Pure env mode (no config file required) |

## 8. config

| # | Command | Expectation |
|---|---|---|
| 8.1 | `KA config show` | JSON |
| 8.2 | `KA config set baseUrl https://<your-platform>` | Persists to file |
| 8.3 | `KA config show` | New value reflected |

## 9. llm / small-model writes (skip when no API key available)

| # | Command | Expectation |
|---|---|---|
| 9.1 | `KA llm add --name test --series openai --model gpt-x --api-key sk-... --base-url ...` | Success |
| 9.2 | `KA llm test test` | Health check OK / structured failure |
| 9.3 | `KA llm edit test --base-url ...` | Update accepted |
| 9.4 | `KA llm delete test` | Confirmation + delete |
| 9.5 | `small-model add / get / edit / delete / test` | Same pattern as llm |

## 10. Automation / packaging

### 10A. Local build from source (pre-release gate)

| # | Command | Expectation |
|---|---|---|
| 10A.1 | `npm ci && npm run lint` | 0 errors |
| 10A.2 | `npm test` | 14 files / 64 tests pass |
| 10A.3 | `npm run build` | `dist/index.js` ~135 KB, shebang `#!/usr/bin/env node` |
| 10A.4 | `npm pack --dry-run` | Tarball contains only `dist/` + `README*` + `docs/SECURITY.md` + `package.json` |
| 10A.5 | `node ./dist/index.js --version` | `0.6.0` |

### 10B. Published npm package (post-release)

| # | Command | Expectation |
|---|---|---|
| 10B.1 | `npm install -g @kweaver-ai/kweaver-admin@0.6.0` | Installs without warnings |
| 10B.2 | `which kweaver-admin && kweaver-admin --version` | Resolves to npm global bin, prints `0.6.0` |
| 10B.3 | `npx -y @kweaver-ai/kweaver-admin@0.6.0 --version` | Works without prior install, prints `0.6.0` |
| 10B.4 | `npm view @kweaver-ai/kweaver-admin@0.6.0 dist.tarball` | Tarball URL on registry.npmjs.org with provenance attached |
| 10B.5 | `npm uninstall -g @kweaver-ai/kweaver-admin` | Cleanly removes; `kweaver-admin` no longer on PATH |

---

## Release readiness gate

Before tagging `v0.6.0`:

- [ ] Sections 0, 1, 2, 3, 4, 5, 7, 8, 10 all green on the live deployment
- [ ] Section 6 verified at least once (manual auth lifecycle); section 6B
      recommended when changing `auth whoami` / env precedence
- [ ] Section 9 either green or explicitly skipped with reason
- [ ] `.github/workflows/ci.yml` and `.github/workflows/publish-npm.yml`
      committed (requires a token with `workflow` scope, or add via the
      GitHub web UI)
- [ ] npm OIDC Trusted Publisher configured for
      `@kweaver-ai/kweaver-admin` (repo `kweaver-ai/kweaver-admin`,
      workflow `publish-npm.yml`) - or fall back to `NPM_TOKEN` secret

When ready:

```bash
git tag v0.6.0
git push origin v0.6.0
```

The `Publish to npm` workflow runs lint -> test -> build -> `npm publish
--provenance --access public`.
