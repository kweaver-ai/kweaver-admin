/**
 * UserManagement REST `GET /api/user-management/v1/users` (list/detail) is
 * often not registered; errors surface as generic HTTP 404.
 */
export const USER_REST_LIST_GET_404_HINT =
  "\n\nHint: This deployment may not expose GET /api/user-management/v1/users (list/detail). " +
  "Resolve a login to id via `kweaver-admin call GET /api/user-management/v1/console/search-users/account?account=<login>&role=super_admin&limit=10` " +
  "or `kweaver-admin user reset-password -u <login>` (uses search internally). See docs/SECURITY.md.";

export function appendUserRest404Hint(message: string): string {
  if (!/404|not found/i.test(message)) return message;
  return message + USER_REST_LIST_GET_404_HINT;
}
