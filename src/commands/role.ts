import type { Command } from "commander";
import chalk from "chalk";
import { ApiClient } from "../lib/api-client";
import { loadConfig } from "../lib/config";
import { resolveCliBaseUrl } from "../lib/resolve-cli-base-url";
import { wantsJsonOutput } from "../lib/cli-json";
import { printColumns, printJson } from "../utils/output";
import { exitUserError } from "../utils/errors";
import { resolveRoleId, resolveUserId } from "../lib/resolve-refs";

function client(program: Command): ApiClient {
  const config = loadConfig();
  const baseUrl = resolveCliBaseUrl(program, config);
  return new ApiClient({ baseUrl, config });
}

const VALID_SOURCES = new Set(["system", "business", "user"]);
const VALID_MEMBER_TYPES = new Set(["user", "department", "group", "app"]);
type MemberType = "user" | "department" | "group" | "app";

interface PagedResult<T> {
  entries?: T[];
  total_count?: number;
}

function parseInt0(value: string | undefined, fallback: number, label: string): number {
  if (value === undefined) return fallback;
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
  return n;
}

/** Shown after built-in help for `role add-member` / `role remove-member`. */
const HELP_ROLE_MEMBER_EXAMPLES_ADD = [
  "",
  "How it works",
  "  1) First argument: which role (exact role name, or role UUID).",
  "  2) Required flag --member: who to add (repeat the flag, or list several values after one --member).",
  "     Each value looks like  type:value",
  "       user:         login name or user UUID",
  "       department:   department UUID only",
  "       group / app:  UUID only",
  "",
  "Examples",
  "  kweaver-admin role add-member 数据管理员 --member user:admin",
  "  kweaver-admin role add-member 应用管理员 --member user:alice user:bob",
  "  kweaver-admin user assign-role admin 数据管理员",
  "",
  "Tip: one user + one role → `user assign-role <login> <role>` is shorter than `role add-member`.",
].join("\n");

const HELP_ROLE_MEMBER_EXAMPLES_REMOVE = [
  "",
  "Same rules as add-member: <role> then one or more --member type:value entries.",
  "Examples",
  "  kweaver-admin role remove-member 数据管理员 --member user:admin",
  "  kweaver-admin user revoke-role admin 数据管理员",
].join("\n");

export function registerRoleCommands(program: Command): void {
  const role = program
    .command("role")
    .description(
      "Role management (platform authorization). " +
        "Workflow: `role list` to find a role id, then `role members <role>` to inspect, " +
        "or `role add-member <role> --member <type>:<id>` to grant. " +
        "For assigning one role to one user, `kweaver-admin user assign-role` is shorter.",
    );

  role
    .command("list")
    .option(
      "--source <source...>",
      "Filter by role source (system|business|user; repeatable)",
    )
    .option("--keyword <text>", "Substring search on role name")
    .option("--offset <n>", "Pagination offset (default 0)")
    .option("--limit <n>", "Page size (default 100, max 1000)")
    .description(
      "List roles defined on the platform. The ROLE ID column is the UUID needed by " +
        "`role members`, `role add-member`, `user assign-role`, etc. " +
        "Source filter: system = built-in, business = product-defined, user = custom.",
    )
    .action(
      async (opts: {
        source?: string[];
        keyword?: string;
        offset?: string;
        limit?: string;
      }) => {
        const json = wantsJsonOutput(program);
        const c = client(program);
        if (!c.hasToken()) {
          exitUserError(
            "No token: set KWEAVER_ADMIN_TOKEN, run `kweaver-admin auth login`, or export KWEAVER_TOKEN",
          );
        }
        try {
          const sources = (opts.source ?? []).map((s) => {
            if (!VALID_SOURCES.has(s)) {
              throw new Error(`--source must be one of system|business|user (got '${s}')`);
            }
            return s as "system" | "business" | "user";
          });
          const data = (await c.listRoles({
            offset: parseInt0(opts.offset, 0, "--offset"),
            limit: parseInt0(opts.limit, 100, "--limit"),
            keyword: opts.keyword,
            sources: sources.length ? sources : undefined,
          })) as PagedResult<{
            id: string;
            name?: string;
            description?: string;
            source?: string;
            resource_type_scopes?: { unlimited?: boolean; types?: unknown[] };
          }>;
          if (json) return printJson(data);
          const items = data.entries ?? [];
          printColumns(
            ["ID", "NAME", "SOURCE", "SCOPE", "DESCRIPTION"],
            items.map((r) => [
              r.id,
              r.name ?? "-",
              r.source ?? "-",
              r.resource_type_scopes?.unlimited ? "unlimited" : `types:${r.resource_type_scopes?.types?.length ?? 0}`,
              r.description ?? "-",
            ]),
            { emptyHint: "No roles match the given filters." },
          );
          if (typeof data.total_count === "number") {
            console.log(chalk.dim(`(${items.length}/${data.total_count})`));
          }
        } catch (e) {
          exitUserError(e instanceof Error ? e.message : String(e));
        }
      },
    );

  role
    .command("get")
    .argument("<role>", "Role UUID or exact role name")
    .option("--view <mode>", "resource_type_view_mode: flat (default) | hierarchy")
    .description(
      "Show a role's details (resource type scopes, operations). " +
        "Accepts a UUID or exact role name.",
    )
    .action(async (roleRef: string, opts: { view?: string }) => {
      const c = client(program);
      if (!c.hasToken()) {
        exitUserError(
          "No token: set KWEAVER_ADMIN_TOKEN, run `kweaver-admin auth login`, or export KWEAVER_TOKEN",
        );
      }
      const view = opts.view;
      if (view !== undefined && view !== "flat" && view !== "hierarchy") {
        exitUserError("--view must be 'flat' or 'hierarchy'");
      }
      try {
        const id = await resolveRoleId(c, roleRef);
        const data = await c.getRole(id, {
          resourceTypeViewMode: view as "flat" | "hierarchy" | undefined,
        });
        printJson(data);
      } catch (e) {
        exitUserError(e instanceof Error ? e.message : String(e));
      }
    });

  role
    .command("members")
    .argument("<role>", "Role UUID or exact role name (e.g. '数据管理员').")
    .option("--type <type...>", "Filter by member type (user|department|group|app; repeatable)")
    .option("--keyword <text>", "Substring search on member name")
    .option("--offset <n>", "Pagination offset (default 0)")
    .option("--limit <n>", "Page size (default 100, max 1000)")
    .description(
      "List the users, departments, groups, and apps that hold a role. " +
        "Returned member IDs work with `role remove-member --member <type>:<id>`.",
    )
    .action(
      async (
        roleRef: string,
        opts: { type?: string[]; keyword?: string; offset?: string; limit?: string },
      ) => {
        const json = wantsJsonOutput(program);
        const c = client(program);
        if (!c.hasToken()) {
          exitUserError(
            "No token: set KWEAVER_ADMIN_TOKEN, run `kweaver-admin auth login`, or export KWEAVER_TOKEN",
          );
        }
        try {
          const roleId = await resolveRoleId(c, roleRef);
          const types = (opts.type ?? []).map((t) => {
            if (!VALID_MEMBER_TYPES.has(t)) {
              throw new Error(`--type must be one of user|department|group|app (got '${t}')`);
            }
            return t as MemberType;
          });
          const data = (await c.getRoleMembers(roleId, {
            offset: parseInt0(opts.offset, 0, "--offset"),
            limit: parseInt0(opts.limit, 100, "--limit"),
            keyword: opts.keyword,
            types: types.length ? types : undefined,
          })) as PagedResult<{
            id: string;
            type?: string;
            name?: string;
            parent_deps?: unknown;
          }>;
          if (json) return printJson(data);
          const items = data.entries ?? [];
          printColumns(
            ["ID", "TYPE", "NAME"],
            items.map((m) => [m.id, m.type ?? "-", m.name ?? "-"]),
            { emptyHint: `Role ${roleId} has no members.` },
          );
          if (typeof data.total_count === "number") {
            console.log(chalk.dim(`(${items.length}/${data.total_count})`));
          }
        } catch (e) {
          exitUserError(e instanceof Error ? e.message : String(e));
        }
      },
    );

  function parseMemberSpec(spec: string): { ref: string; type: MemberType } {
    const idx = spec.indexOf(":");
    if (idx <= 0 || idx === spec.length - 1) {
      throw new Error(`Invalid --member '${spec}': expected '<type>:<id-or-name>'`);
    }
    const type = spec.slice(0, idx);
    const ref = spec.slice(idx + 1);
    if (!VALID_MEMBER_TYPES.has(type)) {
      throw new Error(`--member type must be one of user|department|group|app (got '${type}')`);
    }
    return { ref, type: type as MemberType };
  }

  /**
   * Turn a parsed `<type>:<ref>` into the `{type,id}` shape the API wants.
   * `user:<account>` is resolved via the search-users endpoint; other
   * non-UUID names are not auto-resolved (no public lookup) — pass UUIDs.
   */
  async function resolveMemberRef(
    c: ApiClient,
    parsed: { ref: string; type: MemberType },
  ): Promise<{ id: string; type: MemberType }> {
    const { ref, type } = parsed;
    if (UUID_LIKE.test(ref.trim())) return { id: ref.trim(), type };
    if (type === "user") {
      const id = await resolveUserId(c, ref);
      return { id, type };
    }
    throw new Error(
      `--member ${type}:${ref}: only user names are auto-resolved. ` +
        `Pass a UUID for ${type} members (find via the matching list command).`,
    );
  }

  const UUID_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  role
    .command("add-member")
    .summary("Add people (or depts/groups/apps) to a role; requires --member")
    .argument("<role>", "Which role: exact name (e.g. 数据管理员) or role UUID")
    .requiredOption(
      "--member <type:value...>",
      "Required. Who gets this role. Form: user:<login|uuid> or department|group|app:<uuid>. " +
        "Repeat --member or pass several values after one --member.",
    )
    .description(
      "Grant a role to one or more members in one request. " +
        "You must pass --member (the CLI cannot guess who to add). " +
        "For a single user + single role, prefer `kweaver-admin user assign-role <login> <role>`.",
    )
    .addHelpText("after", HELP_ROLE_MEMBER_EXAMPLES_ADD)
    .showHelpAfterError(true)
    .action(async (roleRef: string, opts: { member: string[] }) => {
      const c = client(program);
      if (!c.hasToken()) {
        exitUserError(
          "No token: set KWEAVER_ADMIN_TOKEN, run `kweaver-admin auth login`, or export KWEAVER_TOKEN",
        );
      }
      try {
        const roleId = await resolveRoleId(c, roleRef);
        const parsed = opts.member.map(parseMemberSpec);
        const members = await Promise.all(parsed.map((m) => resolveMemberRef(c, m)));
        await c.modifyRoleMembers(roleId, "POST", members);
        console.log(
          chalk.green(`Added ${members.length} member(s) to role ${roleId}`),
        );
      } catch (e) {
        exitUserError(e instanceof Error ? e.message : String(e));
      }
    });

  role
    .command("remove-member")
    .summary("Remove members from a role; requires --member")
    .argument("<role>", "Which role: exact name or role UUID")
    .requiredOption(
      "--member <type:value...>",
      "Required. Who loses this role (same type:value rules as add-member).",
    )
    .description(
      "Revoke a role from one or more members in one request. " +
        "You must pass --member. " +
        "For one user + one role, prefer `kweaver-admin user revoke-role <login> <role>`.",
    )
    .addHelpText("after", HELP_ROLE_MEMBER_EXAMPLES_REMOVE)
    .showHelpAfterError(true)
    .action(async (roleRef: string, opts: { member: string[] }) => {
      const c = client(program);
      if (!c.hasToken()) {
        exitUserError(
          "No token: set KWEAVER_ADMIN_TOKEN, run `kweaver-admin auth login`, or export KWEAVER_TOKEN",
        );
      }
      try {
        const roleId = await resolveRoleId(c, roleRef);
        const parsed = opts.member.map(parseMemberSpec);
        const members = await Promise.all(parsed.map((m) => resolveMemberRef(c, m)));
        await c.modifyRoleMembers(roleId, "DELETE", members);
        console.log(
          chalk.green(`Removed ${members.length} member(s) from role ${roleId}`),
        );
      } catch (e) {
        exitUserError(e instanceof Error ? e.message : String(e));
      }
    });
}
