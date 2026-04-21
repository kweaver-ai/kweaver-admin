import type { Command } from "commander";
import chalk from "chalk";
import { ApiClient } from "../lib/api-client";
import { loadConfig } from "../lib/config";
import { resolveCliBaseUrl } from "../lib/resolve-cli-base-url";
import { wantsJsonOutput } from "../lib/cli-json";
import { printColumns, printJson } from "../utils/output";
import { exitUserError } from "../utils/errors";

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

export function registerRoleCommands(program: Command): void {
  const role = program
    .command("role")
    .description("Role management (Authorization service: /api/authorization/v1)");

  role
    .command("list")
    .option(
      "--source <source...>",
      "Filter by role source (system|business|user; repeatable)",
    )
    .option("--keyword <text>", "Substring search on role name")
    .option("--offset <n>", "Pagination offset (default 0)")
    .option("--limit <n>", "Page size (default 100, max 1000)")
    .description("List roles")
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
    .argument("<id>", "Role id")
    .option("--view <mode>", "resource_type_view_mode: flat (default) | hierarchy")
    .description("Show a role's details (resource type scopes, operations)")
    .action(async (id: string, opts: { view?: string }) => {
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
    .argument("<roleId>", "Role id")
    .option("--type <type...>", "Filter by member type (user|department|group|app; repeatable)")
    .option("--keyword <text>", "Substring search on member name")
    .option("--offset <n>", "Pagination offset (default 0)")
    .option("--limit <n>", "Page size (default 100, max 1000)")
    .description("List members of a role")
    .action(
      async (
        roleId: string,
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

  function parseMemberSpec(spec: string): { id: string; type: MemberType } {
    const idx = spec.indexOf(":");
    if (idx <= 0 || idx === spec.length - 1) {
      throw new Error(`Invalid --member '${spec}': expected '<type>:<id>'`);
    }
    const type = spec.slice(0, idx);
    const id = spec.slice(idx + 1);
    if (!VALID_MEMBER_TYPES.has(type)) {
      throw new Error(`--member type must be one of user|department|group|app (got '${type}')`);
    }
    return { id, type: type as MemberType };
  }

  role
    .command("add-member")
    .argument("<roleId>", "Role id")
    .requiredOption(
      "--member <spec...>",
      "Member spec '<type>:<id>' (type: user|department|group|app); repeatable",
    )
    .description("Add one or more members to a role")
    .action(async (roleId: string, opts: { member: string[] }) => {
      const c = client(program);
      if (!c.hasToken()) {
        exitUserError(
          "No token: set KWEAVER_ADMIN_TOKEN, run `kweaver-admin auth login`, or export KWEAVER_TOKEN",
        );
      }
      try {
        const members = opts.member.map(parseMemberSpec);
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
    .argument("<roleId>", "Role id")
    .requiredOption(
      "--member <spec...>",
      "Member spec '<type>:<id>' (type: user|department|group|app); repeatable",
    )
    .description("Remove one or more members from a role")
    .action(async (roleId: string, opts: { member: string[] }) => {
      const c = client(program);
      if (!c.hasToken()) {
        exitUserError(
          "No token: set KWEAVER_ADMIN_TOKEN, run `kweaver-admin auth login`, or export KWEAVER_TOKEN",
        );
      }
      try {
        const members = opts.member.map(parseMemberSpec);
        await c.modifyRoleMembers(roleId, "DELETE", members);
        console.log(
          chalk.green(`Removed ${members.length} member(s) from role ${roleId}`),
        );
      } catch (e) {
        exitUserError(e instanceof Error ? e.message : String(e));
      }
    });
}
