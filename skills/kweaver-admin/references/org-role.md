# Org and Role Commands

## Org

### `org list`

- `--role <role>`: UserManagement role context. Default comes from
  `KWEAVER_UM_ROLE`; if unset, CLI falls back to `super_admin`.
- `--offset <n>`: default `0`
- `--limit <n>`: default `100`
- `--name <keyword>`

### `org tree`

- `--role <role>`
- Same default role behavior as `org list`.

### `org get <id>`

- `<id>`: department id.
- For negative ids use separator form: `org get -- -1`.

Behavior:

- CLI prefers ShareMgnt detail lookups because public REST get route may be
  private/unregistered on some deployments.
- Sentinel `-1` may still fail on some clusters with ShareMgnt `errID=99`; use
  a real root id from `org list --json` in that case.

### `org create`

- `--name <name>` (required)
- `--parent <id>` (default root `-1`)
- `--manager <userId>`
- `--code <code>`
- `--remark <text>`
- `--email <email>`
- `--status <n>`
- `--oss-id <id>`

Behavior:

- Uses ShareMgnt `Usrm_AddDepartment`.
- Default parent is root `-1` when `--parent` is omitted.

### `org update <id>`

- `--name <name>`
- `--manager <userId>` (`''` clears)
- `--code <code>`
- `--remark <text>`
- `--email <email>`
- `--status <n>`
- `--oss-id <id>`

Behavior:

- Uses ShareMgnt `Usrm_EditDepartment`.
- Clearing manager requires empty string at CLI layer (`--manager ''`).

### `org delete <id>`

- Deletes department via management endpoint.
- No built-in thrift fallback here; failures are surfaced directly.

### `org members <id>`

- `--role <role>`
- `--fields <segment>`: `users` / `departments` / `users,departments`
- `--offset <n>`: default `0`
- `--limit <n>`: default `100`

## Role

### Name vs UUID resolution

Every command that takes a `<role>` or `<user>` argument accepts **either**:

- a UUID (used as-is), or
- a human-readable name:
  - **user names** resolve via `GET /api/user-management/v1/console/search-users/account?account=<name>` — the value should be the user's `account` (login name).
  - **role names** resolve via `GET /api/authorization/v1/roles?keyword=<name>` and require an **exact** match. Substring or duplicate matches are rejected with the candidate list so the CLI never silently picks one.

For `role add-member` / `remove-member`, only `--member user:<account>` is auto-resolved. `department:` / `group:` / `app:` still require UUIDs (no public name lookup).

### `role list`

- `--source <source...>`: `system|business|user`.
- `--keyword <text>` (substring; for assignment commands you usually want the exact name instead)
- `--offset <n>`: default `0`
- `--limit <n>`: default `100`

Validation:

- invalid source values are rejected by CLI before request.

### `role get <role>`

- `<role>`: UUID **or** exact role name.
- `--view <mode>`: `flat` or `hierarchy`.

Validation:

- CLI rejects other `--view` values.
- Role name resolved as described above; ambiguous/missing → exit with error.

### `role members <role>`

- `<role>`: UUID **or** exact role name.
- `--type <type...>`: `user|department|group|app`.
- `--keyword <text>`
- `--offset <n>`: default `0`
- `--limit <n>`: default `100`

### `role add-member <role>`

- `<role>`: UUID **or** exact role name.
- `--member <type:value...>` (**required**): who receives the role. Omitting `--member` is invalid; run `role add-member --help` or invoke the command without `--member` and the CLI prints the same usage block with examples.
  - `user:<uuid>` or `user:<account>` (auto-resolved)
  - `department:<uuid>` / `group:<uuid>` / `app:<uuid>` (UUID only)
- Prefer `user assign-role <login> <role>` when adding exactly one user to one role.

Examples:

```bash
kweaver-admin role add-member 数据管理员 --member user:admin user:cli-test-1
kweaver-admin role add-member 11111111-... --member user:11111111-... department:33333333-...
```

### `role remove-member <role>`

- Same `<role>` and `--member` resolution rules as `add-member`; `--member` is still required.
