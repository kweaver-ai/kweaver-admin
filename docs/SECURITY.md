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

## User creation password

`kweaver-admin user create` calls `Usrm_AddUser` (ISFWeb thrift) which **does not
accept a password parameter**. The new account always lands with the platform
default password **`123456`**, and the `pwd_control` flag forces the user to
change it at first login.

Why the CLI does not rotate the password automatically after creation:

| Path | Why it does not work from CLI |
|------|--------------------------------|
| `Usrm_EditUser` (set `pwdControl` + `pwd`) | pyThrift rejects nested JSON for `ncTEditUserParam`: `'dict' object has no attribute 'write'` |
| `Usrm_ModifyPassword` thrift | Same pyThrift JSON envelope issue with the `ncTUserModifyPwdOption` struct |
| `POST /api/eacp/v1/auth1/modifypassword` | Requires `Base64(RSA_PublicEncrypt(pwd))` for both `oldpwd` and `newpwd`, plus a `CheckSign` signature derived from a server-side secret. Even the ISFWeb console does not call this from a thin client; it is invoked from the password-change UI which is bundled with the public key + signing material. |

The CLI can **admin-reset** passwords via UserManagement
`PUT /api/user-management/v1/management/users/:id/password` (`kweaver-admin user reset-password`).
Self-service change still uses EACP `modifypassword` (RSA bodies) from `auth change-password`.

Operationally:

- `kweaver-admin user create --login alice` → user `alice` exists with password `123456`
- Hand `alice` the password over a secure channel; she will be forced to change it on first sign-in
- For lost-password rotation, prefer `kweaver-admin user reset-password -u alice` (admin), or ISFWeb console / directory-sync

This is **not** a secret — it is documented behaviour of the upstream ISF
platform (`isf/UserManagement/migrations/init.sql` seeds the default
`user_defalut_*_password` hashes to those of `123456`).

## Department write fallback (`Usrm_AddDepartment` / `Usrm_EditDepartment`)

UserManagement REST does not expose POST/PATCH routes for departments
(`isf/UserManagement/driveradapters/department_rest_handler.go` only
registers GET / DELETE). `kweaver-admin org create` and `org update` go
through ISFWeb thrift directly, mirroring the console's payload shape:

```
Usrm_AddDepartment:  [{ ncTAddDepartParam:  { parentId, departName, managerID,
                                              code, remark, status, email, ossId } }]
Usrm_EditDepartment: [{ ncTEditDepartParam: { departId, departName, managerID,
                                              code, remark, status, email, ossId } }]
```

`org delete` continues to use `DELETE /api/user-management/v1/management/departments/:id`.

## User-roles fallback

`/api/authorization/v1/accessor_roles` is registered via `RegisterPrivate`
(`isf/Authorization/driveradapters/role_rest_handler.go:88-92`), so a
public ingress typically returns 404. When that happens
`kweaver-admin user roles` enumerates `role list` and queries each role's
members, returning only those that contain the target user id. Marked in
the JSON output as `route: "fallback:list-roles+role-members"`.

## User get / list routing

UserManagement registers two flavours of the user-info routes:

| Route | Visibility | Notes |
|------|-----------|-------|
| `GET /api/user-management/v1/users/:user_id/:fields` | `RegisterPrivate` | Cluster-internal; public ingress 404s. |
| `GET /api/user-management/v1/users/:user_ids/:fields?role=…` | Public | Field whitelist limited to `name`/`account`/`parent_dep_paths`. |
| `GET /api/user-management/v1/console/search-users/:fields?role=…&offset&limit&department_id&name` | Public | Full whitelist; what the console uses for paginated listings. |

`kweaver-admin user list` calls the `console/search-users` route.
`kweaver-admin user get <id>` calls ISFWeb thrift `Usrm_GetUserInfo` to
get the same `ncTUsrmUserInfo` payload the console reads (avoids the
`role`-scoped public REST whose field set is too narrow for an admin
"show user" view).

`kweaver-admin user update <id>` PATCHes the **public** route
`PATCH /api/user-management/v1/management/users/:user_id` (note the
`/management/` prefix — the bare `/users/:id` form is `RegisterPrivate`).

## Department get routing

`GET /api/user-management/v1/departments/:id/:fields` is also
`RegisterPrivate`, so `kweaver-admin org get` goes through ISFWeb
thrift, trying `Usrm_GetOrgDepartmentById` first (root-level orgs) and
falling back to `Usrm_GetDepartmentById` for sub-departments.

## User update fallback (`Usrm_EditUser`)

`PATCH /api/user-management/v1/users/:id` is **not registered** on every
deployment (the route returns `404 page not found`). When the REST PATCH
fails with 404, `kweaver-admin user update` automatically falls back to
ISFWeb thrift `ShareMgnt.Usrm_EditUser`, mirroring the exact payload shape
used by the console
(`isf/ISFWeb/src/components/EditUser/component.base.tsx`):

```
[
  { ncTEditUserParam: { id, displayName, code, position, managerID,
       remark, idcardNumber, priority, csfLevel, csfLevel2, email,
       telNumber, expireTime } },
  callerUserId
]
```

The caller's `userId` is read from the cached `id_token` `sub` claim
(`resolveCurrentUserId()`), so a recent `kweaver-admin auth login` is
required for the fallback path. Fields not provided on the CLI fall back to
ShareMgnt's "no change" sentinels (empty string / `null` / `-1`) and
`priority`/`csfLevel` default to `999` / `5` to match `Usrm_AddUser`.
