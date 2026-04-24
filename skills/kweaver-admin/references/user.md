# User Commands

## `user list`

- `--org <orgId>`: filter by department id.
- `--keyword <text>`: fuzzy match by display name.
- `--limit <n>`: page size (default 100).
- `--offset <n>`: page offset (default 0).

## `user get <id>`

- `<id>`: user id.

## `user create`

- `--login <loginName>` (required): unique account.
- `--display-name <name>`: display name, defaults to login.
- `--department <id...>`: one or multiple department ids (repeat/comma list).
- `--csf-level <n>`: confidentiality level; omitted by default to let backend decide.
- `--priority <n>`: sort priority, default 999.
- `--email <email>`, `--tel <number>`, `--code <code>`, `--position <pos>`, `--remark <text>`.

Behavior:

- Uses ShareMgnt `Usrm_AddUser` thrift path.
- Initial password is platform default `123456`.
- If env `KWEAVER_ADMIN_CSF_LEVEL` is set and `--csf-level` is omitted, CLI
  uses that env value.
- If neither `--csf-level` nor env override is set, CLI omits `csfLevel` and
  lets backend choose/init default.

## `user update <id>`

- `--display-name <name>`
- `--code <code>`
- `--position <pos>`
- `--remark <text>`
- `--email <email>`
- `--tel <number>`
- `--manager <id>` (`''` clears)
- `--idcard <number>` (`''` clears)
- `--priority <n>`
- `--csf-level <n>`
- `--csf-level2 <n>`
- `--expire-time <n>`

Behavior:

- Tries REST `PATCH /management/users/:id` first.
- Falls back to ShareMgnt `Usrm_EditUser` when REST route is unavailable.
- `--manager ''` clears manager.
- `--idcard ''` clears id card and is translated to `null`.

## `user delete <id>`

- Deletes one user id.
- CLI does not add a confirmation prompt here.

## `user roles <user>`

- `<user>`: user UUID **or** account/login name (auto-resolved via
  `console/search-users/account`).
- Lists assigned roles.
- On deployments where `accessor_roles` is private, CLI falls back to
  `list roles + role members` matching.

## `user assign-role <user> <role>`

- `<user>`: UUID or account name.
- `<role>`: UUID or **exact** role name (e.g. `数据管理员`). Substring/duplicate
  matches are rejected; pass the UUID instead.
- Convenience wrapper around `POST /api/authorization/v1/role-members/<roleId>`
  with `members=[{type:'user', id:<userId>}]`.

Examples:

```bash
kweaver-admin user assign-role admin 数据管理员
kweaver-admin user assign-role 6b39db6c-... 00990824-...
```

## `user revoke-role <user> <role>`

- Same name/UUID resolution as `assign-role`.
- `DELETE /api/authorization/v1/role-members/<roleId>` with the same body shape.

## `user reset-password`

- `-u, --user <idOrAccount>`: user UUID or account.
- `--id <userId>`: force id mode (for non-standard id format).
- `-p, --password <new>`: new password.
- `--prompt-password`: hidden TTY prompt (mutually exclusive with `--password`).
- `-y, --yes`: skip confirm prompt.

Behavior:

- Admin reset route: `PUT /api/user-management/v1/management/users/:id/password`.
- Old password is not required.
- Default reset password is `123456` when `-p` and `--prompt-password` are absent.
- `--user` and `--id` are mutually exclusive.
- `--password` and `--prompt-password` are mutually exclusive.
- `--prompt-password` is incompatible with `--json` because it requires TTY
  interaction.
- UUID-shaped `--user` input is treated as id automatically; non-UUID input is
  resolved as account/login via search.
