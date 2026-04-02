# User management

## Scope

- List, get, create, update, delete users.
- List roles for a user: `kweaver-admin user roles <userId>`.
- Assign/revoke existing roles on users.

## CLI

- `kweaver-admin user list [--org <orgId>] [--json]`
- `kweaver-admin user get <id> [--json]`
- `kweaver-admin user create --login <name> --password <password> [--display-name <name>] [--org <orgId>]`
- `kweaver-admin user update <id> [--display-name <name>] [--org <orgId>]`
- `kweaver-admin user delete <id>`
- `kweaver-admin user roles <userId> [--json]`
- `kweaver-admin user assign-role <userId> <roleId>`
- `kweaver-admin user revoke-role <userId> <roleId>`

## Backend reference

Example path from deploy-web: `GET /api/user-management/v1/users/{userid}/roles`.
