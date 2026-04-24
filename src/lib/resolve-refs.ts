/**
 * Helpers that turn a user-supplied "reference" — either a UUID or a
 * human-friendly name — into the concrete UUID expected by the platform
 * APIs. Keeps CLI commands ergonomic while leaving the underlying API
 * client UUID-only.
 */

import type { ApiClient } from "./api-client";

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function looksLikeUuid(value: string): boolean {
  return UUID_RE.test(value.trim());
}

/**
 * Resolve a user reference (UUID, account/login name) to a UUID.
 * Throws a clear error on miss / ambiguity instead of silently picking one.
 */
export async function resolveUserId(
  client: Pick<ApiClient, "findUserByAccount">,
  ref: string,
): Promise<string> {
  const value = ref.trim();
  if (!value) throw new Error("Empty user reference");
  if (looksLikeUuid(value)) return value;
  const found = await client.findUserByAccount(value);
  if (!found) {
    throw new Error(
      `User '${value}' not found. Pass the UUID directly, or check ` +
        "`kweaver-admin user list --keyword <name>`.",
    );
  }
  return found.id;
}

/**
 * Resolve a role reference (UUID or exact role name) to a UUID. The
 * Authorization service's `keyword` filter is a substring match, so we
 * pull a candidate page and require exactly one **exact** name hit.
 */
export async function resolveRoleId(
  client: Pick<ApiClient, "listRoles">,
  ref: string,
): Promise<string> {
  const value = ref.trim();
  if (!value) throw new Error("Empty role reference");
  if (looksLikeUuid(value)) return value;
  const data = (await client.listRoles({
    keyword: value,
    offset: 0,
    limit: 200,
    sources: ["system", "business", "user"],
  })) as { entries?: Array<{ id: string; name?: string }> };
  const entries = data.entries ?? [];
  const exact = entries.filter((e) => e.name === value);
  if (exact.length === 1) return exact[0]!.id;
  if (exact.length > 1) {
    throw new Error(
      `Role name '${value}' is ambiguous (${exact.length} matches). ` +
        "Pass the role UUID instead. Candidates: " +
        exact.map((e) => `${e.id}=${e.name}`).join(", "),
    );
  }
  if (entries.length === 0) {
    throw new Error(
      `Role '${value}' not found. Check \`kweaver-admin role list --keyword ${value}\`.`,
    );
  }
  // Substring matches but no exact — refuse to guess.
  throw new Error(
    `No role exactly named '${value}'. Closest matches: ` +
      entries
        .slice(0, 5)
        .map((e) => `${e.id}=${e.name ?? "?"}`)
        .join(", ") +
      ". Pass the UUID, or use the exact name.",
  );
}
