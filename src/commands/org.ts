import type { Command } from "commander";
import chalk from "chalk";
import { ApiClient } from "../lib/api-client";
import { loadConfig } from "../lib/config";
import { resolveCliBaseUrl } from "../lib/resolve-cli-base-url";
import { wantsJsonOutput } from "../lib/cli-json";
import { exitUserError } from "../utils/errors";
import { printColumns, printJson } from "../utils/output";
import type { OrgUnit } from "../lib/types";
import { resolveDefaultUserManagementRole } from "../lib/user-management-role";

function client(program: Command): ApiClient {
  const config = loadConfig();
  const baseUrl = resolveCliBaseUrl(program, config);
  return new ApiClient({ baseUrl, config });
}

function requireToken(c: ApiClient): void {
  if (!c.hasToken()) {
    exitUserError(
      "No token: set KWEAVER_ADMIN_TOKEN, run `kweaver-admin auth login`, or export KWEAVER_TOKEN",
    );
  }
}

type SearchDeptEntry = {
  id: string;
  name?: string;
  parent_deps?: Array<{ id: string; name?: string }>;
};

/** Derive immediate parent id from ISF `parent_deps` chain. */
function orgUnitsFromSearchEntries(entries: unknown[]): OrgUnit[] {
  return entries.map((raw) => {
    const e = raw as SearchDeptEntry;
    const deps = e.parent_deps;
    const parentId =
      deps && deps.length > 0 ? deps[deps.length - 1]?.id : undefined;
    return {
      id: e.id,
      name: e.name ?? e.id,
      parentId,
    };
  });
}

function buildTree(flat: OrgUnit[]): OrgUnit[] {
  const map = new Map<string, OrgUnit & { children: OrgUnit[] }>();
  for (const item of flat) map.set(item.id, { ...item, children: [] });
  const roots: OrgUnit[] = [];
  for (const item of flat) {
    const node = map.get(item.id);
    if (!node) continue;
    if (item.parentId && map.has(item.parentId)) {
      map.get(item.parentId)?.children?.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

function renderTree(nodes: OrgUnit[], prefix = ""): string {
  const lines: string[] = [];
  nodes.forEach((node, i) => {
    const isLast = i === nodes.length - 1;
    const connector = isLast ? "└── " : "├── ";
    const childPrefix = isLast ? "    " : "│   ";
    lines.push(`${prefix}${connector}${node.name} (id: ${node.id})`);
    if (node.children?.length) {
      lines.push(renderTree(node.children, prefix + childPrefix));
    }
  });
  return lines.join("\n");
}

function listFromSearch(data: unknown): { entries: OrgUnit[]; total?: number } {
  const body = data as { entries?: unknown[]; total_count?: number };
  const raw = body.entries ?? [];
  return {
    entries: orgUnitsFromSearchEntries(raw),
    total: body.total_count,
  };
}

function rowsFromDeptUsers(data: unknown): string[][] {
  const d = data as {
    users?: {
      entries?: Array<{ id?: string; account?: string; name?: string }>;
    };
  };
  const entries = d.users?.entries ?? [];
  return entries.map((u) => [u.id ?? "-", u.account ?? "-", u.name ?? "-"]);
}

/** Shown on every subcommand that sends `role` to the API */
const OPTION_ROLE_DESC =
  "Which UserManagement role to call as (e.g. super_admin, org_manager). Must be allowed for your login. Default: env KWEAVER_UM_ROLE, else super_admin.";

export function registerOrgCommands(program: Command): void {
  const org = program
    .command("org")
    .description("Departments and org structure (UserManagement service)")
    .addHelpText(
      "after",
      `
Notes:
  • --role  Required on most subcommands: use a role your account is allowed (e.g. org_manager or normal_user if you are not admin).
  • Behavior  list/tree search the directory. get/members read details. create/update/delete need extra permissions — many clusters turn these off; HTTP 4xx often means "feature disabled here", not a broken CLI.
`,
    );

  org
    .command("list")
    .description("List departments in pages (name filter optional)")
    .option("--role <role>", OPTION_ROLE_DESC, resolveDefaultUserManagementRole())
    .option("--offset <n>", "Skip this many rows (pagination)", (v) => parseInt(v, 10), 0)
    .option("--limit <n>", "Max rows in this page", (v) => parseInt(v, 10), 100)
    .option("--name <keyword>", "Only names containing this text")
    .action(
      async (opts: { role: string; offset: number; limit: number; name?: string }) => {
        const json = wantsJsonOutput(program);
        const c = client(program);
        requireToken(c);
        try {
          const data = await c.listOrgs({
            role: opts.role,
            offset: opts.offset,
            limit: opts.limit,
            name: opts.name,
          });
          if (json) return printJson(data);
          const { entries, total } = listFromSearch(data);
          if (total !== undefined) {
            console.log(chalk.dim(`total_count: ${total}`));
          }
          printColumns(
            ["ID", "NAME", "PARENT (immediate)"],
            entries.map((o) => [o.id, o.name, o.parentId ?? "-"]),
            { emptyHint: "No departments match the given filters." },
          );
        } catch (e) {
          exitUserError(e instanceof Error ? e.message : String(e));
        }
      },
    );

  org
    .command("tree")
    .description("Print department hierarchy as a text tree")
    .option("--role <role>", OPTION_ROLE_DESC, resolveDefaultUserManagementRole())
    .action(async (opts: { role: string }) => {
      const json = wantsJsonOutput(program);
      const c = client(program);
      requireToken(c);
      try {
        const raw = await c.searchDepartmentsAll(opts.role);
        const items = orgUnitsFromSearchEntries(raw);
        const tree = buildTree(items);
        if (json) return printJson(tree);
        if (!items.length) return console.log("(no departments)");
        console.log(renderTree(tree));
      } catch (e) {
        exitUserError(e instanceof Error ? e.message : String(e));
      }
    });

  org
    .command("get")
    .argument(
      "<id>",
      "Department id (if the id starts with `-`, pass it after `--`, e.g. `org get -- -1`)",
    )
    .description("Show full JSON for one department")
    .action(async (id: string) => {
      const json = wantsJsonOutput(program);
      const c = client(program);
      requireToken(c);
      try {
        const data = await c.getOrg(id);
        if (json) return printJson(data);
        printJson(data);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        let hint = "";
        if (/404|not found/i.test(msg)) {
          hint =
            "\n\nHint: this deployment may not expose single-department fetch by id. " +
            "Confirm the id exists with `org list` / `org tree` and copy it from there.";
        }
        if (
          id === "-1" &&
          /errID=?\s*99|NoneType.+subscriptable/i.test(msg)
        ) {
          hint =
            "\n\nHint: this deployment's ShareMgnt cannot resolve sentinel id `-1` " +
            "(backend bug: errID=99). Use a real root department id instead:\n" +
            "  1) `kweaver-admin org list --limit 1 --json`\n" +
            "  2) copy `.entries[0].id` as <root-id>\n" +
            "  3) `kweaver-admin org get <root-id>`";
        }
        exitUserError(msg + hint);
      }
    });

  org
    .command("create")
    .summary("Create a department; requires --name")
    .requiredOption("--name <name>", "New department name")
    .option("--parent <id>", "Parent department id (defaults to root '-1')")
    .option("--manager <userId>", "Responsible person user id")
    .option("--code <code>", "Department code")
    .option("--remark <text>", "Free-form remark")
    .option("--email <email>", "Contact email")
    .option("--status <n>", "Status (1 = enabled, 0 = disabled; default 1)")
    .option("--oss-id <id>", "OSS bucket id")
    .description(
      "Create a department. Some clusters disable this from the CLI; an HTTP 4xx often means the feature is off, not a bad command.",
    )
    .addHelpText(
      "after",
      [
        "",
        "Minimal example",
        "  kweaver-admin org create --name \"R&D\"",
        "",
        "With a parent (get ids from `org list`):",
        "  kweaver-admin org create --name SubTeam --parent <parent-id>",
      ].join("\n"),
    )
    .showHelpAfterError(true)
    .action(
      async (opts: {
        name: string;
        parent?: string;
        manager?: string;
        code?: string;
        remark?: string;
        email?: string;
        status?: string;
        ossId?: string;
      }) => {
        const json = wantsJsonOutput(program);
        const c = client(program);
        requireToken(c);
        try {
          const data = await c.createOrg({
            name: opts.name,
            parentId: opts.parent,
            managerID: opts.manager,
            code: opts.code,
            remark: opts.remark,
            email: opts.email,
            status: opts.status !== undefined ? Number(opts.status) : undefined,
            ossId: opts.ossId,
          });
          if (json) return printJson(data);
          console.log(chalk.green(`Created department ${data.id} (${opts.name})`));
        } catch (e) {
          exitUserError(e instanceof Error ? e.message : String(e));
        }
      },
    );

  org
    .command("update")
    .argument("<id>", "Department id")
    .option("--name <name>", "New display name")
    .option("--manager <userId>", "New responsible person user id; '' to clear")
    .option("--code <code>", "New department code")
    .option("--remark <text>", "New remark")
    .option("--email <email>", "New contact email")
    .option("--status <n>", "Status (1 = enabled, 0 = disabled)")
    .option("--oss-id <id>", "OSS bucket id")
    .description(
      "Update a department. Some clusters disable this from the CLI; HTTP 4xx may mean the feature is off.",
    )
    .action(
      async (
        id: string,
        opts: {
          name?: string;
          manager?: string;
          code?: string;
          remark?: string;
          email?: string;
          status?: string;
          ossId?: string;
        },
      ) => {
        const json = wantsJsonOutput(program);
        const c = client(program);
        requireToken(c);
        try {
          const data = await c.updateOrg(id, {
            name: opts.name,
            managerID: opts.manager === "" ? null : opts.manager,
            code: opts.code,
            remark: opts.remark,
            email: opts.email,
            status: opts.status !== undefined ? Number(opts.status) : undefined,
            ossId: opts.ossId,
          });
          if (json) return printJson(data);
          console.log(chalk.green(`Updated ${id}`));
        } catch (e) {
          exitUserError(e instanceof Error ? e.message : String(e));
        }
      },
    );

  org
    .command("delete")
    .argument("<id>", "Department id")
    .description("Remove a department (management API)")
    .action(async (id: string) => {
      const c = client(program);
      requireToken(c);
      try {
        await c.deleteOrg(id);
        console.log(chalk.green(`Deleted ${id}`));
      } catch (e) {
        exitUserError(e instanceof Error ? e.message : String(e));
      }
    });

  org
    .command("members")
    .argument("<id>", "Department id")
    .description("List users assigned to that department")
    .option("--role <role>", OPTION_ROLE_DESC, resolveDefaultUserManagementRole())
    .option(
      "--fields <segment>",
      "Path token after department id: users (default), departments, or users,departments — see ISF department-members API",
    )
    .option("--offset <n>", "Skip this many users (pagination)", (v) => parseInt(v, 10), 0)
    .option("--limit <n>", "Max users in this page", (v) => parseInt(v, 10), 100)
    .action(
      async (
        id: string,
        opts: { role: string; offset: number; limit: number; fields?: string },
      ) => {
        const json = wantsJsonOutput(program);
        const c = client(program);
        requireToken(c);
        try {
          const data = await c.getOrgMembers(id, {
            role: opts.role,
            offset: opts.offset,
            limit: opts.limit,
            fields: opts.fields,
          });
          if (json) return printJson(data);
          const rows = rowsFromDeptUsers(data);
          printColumns(["ID", "ACCOUNT", "NAME"], rows, {
            emptyHint: `Department ${id} has no members.`,
          });
        } catch (e) {
          exitUserError(e instanceof Error ? e.message : String(e));
        }
      },
    );
}
