# Routing and Fallbacks

This file explains important implementation logic for deployments where some
REST routes are private/unregistered behind public ingress.

## User

- `user list` uses UserManagement `console/search-users` route.
- `user get` uses ShareMgnt `Usrm_GetUserInfo`.
- `user update` prefers REST `PATCH /management/users/:id`; falls back to
  ShareMgnt `Usrm_EditUser` on 404/405.
- `user roles` first tries Authorization `accessor_roles`; on 404 falls back to
  `listRoles + getRoleMembers` matching.
- `user reset-password` uses REST
  `PUT /api/user-management/v1/management/users/:id/password`.

## Org

- `org create` uses ShareMgnt `Usrm_AddDepartment`.
- `org update` uses ShareMgnt `Usrm_EditDepartment`.
- `org get` tries `Usrm_GetOrgDepartmentById`, then falls back to
  `Usrm_GetDepartmentById` on known errors.
- On some deployments, sentinel id `-1` can still fail with ShareMgnt
  `errID=99` (`NoneType ... subscriptable`); use real root id from
  `org list --json`.

## Auth/Token

- Token refresh is automatic when refresh token exists.
- `auth status` can show expired token as refreshable.

## Diagnostics Strategy

1. Re-run command with `--json` when available.
2. Use `call` command to verify endpoint availability directly.
3. If HTTP 404 but command is known to have fallback, verify CLI version and
   check if fallback branch should apply.
