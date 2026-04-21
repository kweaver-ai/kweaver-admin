# Spec: `call` + org CRUD (2026-04-20)

## Goals

1. **`kweaver-admin call`** — Curl-style authenticated HTTP to the platform, aligned with `kweaver call` in `@kweaver-ai/kweaver-sdk`: `-X`, `-H`, `-d`, `-F`, `-bd`, `-v`, `--pretty`, Bearer + optional `token` + `x-business-domain`.
2. **`kweaver-admin org *`** — List/search, tree, get, members, delete using **UserManagement** routes from ISF (`department_rest_handler.go` + ISFWeb `usermanagement/index.ts`), not the legacy `/orgs` stubs.

## Design decisions

- **Argv routing for `call`**: Parse `call` / `curl` before Commander so flags like `-X` are not swallowed (same idea as SDK `cli.ts`).
- **Business domain**: Default `x-business-domain` to `bd_public` when `KWEAVER_BUSINESS_DOMAIN` is unset (SDK parity), applied in `ApiClient` and `call`.
- **Create / update departments**: Upstream ISF UserManagement registers **no** `POST`/`PUT`/`PATCH` for department create/rename on the public REST surface (`department_rest_handler.go` only exposes search, members, batch-get, `GET` by level, and `DELETE` management). CLI subcommands remain for UX but **fail with a clear message** pointing to console, directory sync, or `kweaver-admin call` if the deployment adds a custom route.

## API mapping (ISF)

| Operation | HTTP |
|-----------|------|
| Search / list flat | `GET /api/user-management/v1/console/search-departments/:fields?role&offset&limit&name&…` |
| Tree data | Paginate search; build hierarchy from `parent_deps` |
| Get one | `GET /api/user-management/v1/departments/:id/:fields` |
| Delete | `DELETE /api/user-management/v1/management/departments/:id` |
| Members (users) | `GET /api/user-management/v1/department-members/:id/users?role&offset&limit` — public route; **not** `/management/.../users` (management only allows `:fields=departments`) |

Root org id (ISFWeb): `00000000-0000-0000-0000-000000000000`.

## Verification

- `npm run build`, `npm test`
- Manual: `kweaver-admin call --help`, `kweaver-admin call /api/authorization/v1/roles -X GET` (with token)
