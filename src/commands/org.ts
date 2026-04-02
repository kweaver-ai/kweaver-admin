import type { Command } from "commander";
import chalk from "chalk";
import { ApiClient } from "../lib/api-client";
import { loadConfig } from "../lib/config";
import { resolveBaseUrl } from "../lib/auth";
import { exitUserError } from "../utils/errors";
import { printColumns, printJson } from "../utils/output";
import type { OrgUnit } from "../lib/types";

function client(program: Command): ApiClient {
  const opts = program.opts<{ baseUrl?: string }>();
  const config = loadConfig();
  const baseUrl = opts.baseUrl ?? resolveBaseUrl(config);
  return new ApiClient({ baseUrl, config });
}

function requireToken(c: ApiClient): void {
  if (!c.hasToken()) {
    exitUserError(
      "No token: set KWEAVER_ADMIN_TOKEN, run `kweaver-admin auth login`, or export KWEAVER_TOKEN",
    );
  }
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

function listFromResponse<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  const withData = data as { data?: T[] };
  return withData.data ?? [];
}

export function registerOrgCommands(program: Command): void {
  const org = program.command("org").description("Organisation / department management");

  org
    .command("list")
    .description("List organisations")
    .action(async () => {
      const json = program.opts<{ json?: boolean }>().json === true;
      const c = client(program);
      requireToken(c);
      try {
        const data = await c.listOrgs();
        if (json) return printJson(data);
        const items = listFromResponse<OrgUnit>(data);
        printColumns(
          ["ID", "NAME", "PARENT"],
          items.map((o) => [o.id, o.name, o.parentId ?? "-"]),
        );
      } catch (e) {
        exitUserError(e instanceof Error ? e.message : String(e));
      }
    });

  org
    .command("tree")
    .description("Display full org hierarchy as tree")
    .action(async () => {
      const json = program.opts<{ json?: boolean }>().json === true;
      const c = client(program);
      requireToken(c);
      try {
        const data = await c.listOrgs();
        const items = listFromResponse<OrgUnit>(data);
        const tree = buildTree(items);
        if (json) return printJson(tree);
        if (!items.length) return console.log("(no organisations)");
        console.log(renderTree(tree));
      } catch (e) {
        exitUserError(e instanceof Error ? e.message : String(e));
      }
    });

  org
    .command("get")
    .argument("<id>", "Organisation ID")
    .description("Get organisation details")
    .action(async (id: string) => {
      const json = program.opts<{ json?: boolean }>().json === true;
      const c = client(program);
      requireToken(c);
      try {
        const data = await c.getOrg(id);
        if (json) return printJson(data);
        printJson(data);
      } catch (e) {
        exitUserError(e instanceof Error ? e.message : String(e));
      }
    });

  org
    .command("create")
    .requiredOption("--name <name>", "Department name")
    .option("--parent <id>", "Parent department ID")
    .description("Create a department")
    .action(async (opts: { name: string; parent?: string }) => {
      const json = program.opts<{ json?: boolean }>().json === true;
      const c = client(program);
      requireToken(c);
      try {
        const data = await c.createOrg({ name: opts.name, parentId: opts.parent });
        if (json) return printJson(data);
        console.log(chalk.green(`Created: ${opts.name}`));
      } catch (e) {
        exitUserError(e instanceof Error ? e.message : String(e));
      }
    });

  org
    .command("update")
    .argument("<id>", "Department ID")
    .requiredOption("--name <name>", "New name")
    .description("Update a department")
    .action(async (id: string, opts: { name: string }) => {
      const json = program.opts<{ json?: boolean }>().json === true;
      const c = client(program);
      requireToken(c);
      try {
        const data = await c.updateOrg(id, { name: opts.name });
        if (json) return printJson(data);
        console.log(chalk.green(`Updated ${id}`));
      } catch (e) {
        exitUserError(e instanceof Error ? e.message : String(e));
      }
    });

  org
    .command("delete")
    .argument("<id>", "Department ID")
    .description("Delete a department")
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
    .argument("<id>", "Department ID")
    .description("List members of a department")
    .action(async (id: string) => {
      const json = program.opts<{ json?: boolean }>().json === true;
      const c = client(program);
      requireToken(c);
      try {
        const data = await c.getOrgMembers(id);
        if (json) return printJson(data);
        const items = listFromResponse<{ id: string; login: string; displayName?: string }>(data);
        printColumns(
          ["ID", "LOGIN", "DISPLAY NAME"],
          items.map((u) => [u.id, u.login, u.displayName ?? "-"]),
        );
      } catch (e) {
        exitUserError(e instanceof Error ? e.message : String(e));
      }
    });
}
