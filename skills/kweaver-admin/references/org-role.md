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

### `role list`

- `--source <source...>`: `system|business|user`.
- `--keyword <text>`
- `--offset <n>`: default `0`
- `--limit <n>`: default `100`

Validation:

- invalid source values are rejected by CLI before request.

### `role get <id>`

- `--view <mode>`: `flat` or `hierarchy`.

Validation:

- CLI rejects other values.

### `role members <roleId>`

- `--type <type...>`: `user|department|group|app`.
- `--keyword <text>`
- `--offset <n>`: default `0`
- `--limit <n>`: default `100`

Validation:

- invalid `--type` values are rejected by CLI before request.

### `role add-member <roleId>`

- `--member <spec...>` (required): repeatable member spec
  `'<type>:<id>'`, where type is `user|department|group|app`.

Validation:

- spec must contain exactly one leading `<type>:` prefix with non-empty id.

### `role remove-member <roleId>`

- `--member <spec...>` (required): repeatable member spec
  `'<type>:<id>'`, where type is `user|department|group|app`.

Validation:

- same member spec rules as `add-member`.
