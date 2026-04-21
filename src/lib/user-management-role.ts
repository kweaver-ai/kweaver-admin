/**
 * UserManagement console APIs take a `role` query (e.g. search-departments, department-members).
 * The server checks that the authenticated user may act in that role; non-admins must use a
 * matching role such as `normal_user` or `org_manager`, not `super_admin`.
 *
 * @see ISF `department_rest_handler.go` (`roleEnumIDMap`, `roleManageEnumIDMap`).
 */
export function resolveDefaultUserManagementRole(): string {
  const fromEnv = process.env.KWEAVER_UM_ROLE?.trim();
  return fromEnv || "super_admin";
}
