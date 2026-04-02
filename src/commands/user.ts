import type { Command } from "commander";
import chalk from "chalk";
import { ApiClient } from "../lib/api-client";
import { loadConfig } from "../lib/config";
import { resolveBaseUrl } from "../lib/auth";
import { printColumns, printJson } from "../utils/output";
import { exitUserError } from "../utils/errors";

function client(program: Command): ApiClient {
  const opts = program.opts<{ baseUrl?: string }>();
  const config = loadConfig();
  const baseUrl = opts.baseUrl ?? resolveBaseUrl(config);
  return new ApiClient({ baseUrl, config });
}

export function registerUserCommands(program: Command): void {
  const user = program.command("user").description("User management");
  const protectedAccounts = new Set(["system", "admin", "security", "audit"]);

  user
    .command("list")
    .option("--org <orgId>", "Filter by organisation ID")
    .description("List users")
    .action(async (opts: { org?: string }) => {
      const json = program.opts<{ json?: boolean }>().json === true;
      const c = client(program);
      if (!c.hasToken()) {
        exitUserError(
          "No token: set KWEAVER_ADMIN_TOKEN, run `kweaver-admin auth login`, or export KWEAVER_TOKEN",
        );
      }
      try {
        const data = await c.listUsers(opts.org);
        if (json) return printJson(data);
        const items = Array.isArray(data) ? data : ((data as { data?: unknown[] }).data ?? []);
        printColumns(
          ["ID", "LOGIN", "DISPLAY NAME", "UPDATED"],
          items.map((u) => {
            const userItem = u as {
              id: string;
              login: string;
              displayName?: string;
              updateTime?: string;
            };
            return [
              userItem.id,
              userItem.login,
              userItem.displayName ?? "-",
              userItem.updateTime ?? "-",
            ];
          }),
        );
      } catch (e) {
        exitUserError(e instanceof Error ? e.message : String(e));
      }
    });

  user
    .command("get")
    .argument("<id>", "User id")
    .description("Get user by id")
    .action(async (id: string) => {
      const json = program.opts<{ json?: boolean }>().json === true;
      const c = client(program);
      if (!c.hasToken()) {
        exitUserError(
          "No token: set KWEAVER_ADMIN_TOKEN, run `kweaver-admin auth login`, or export KWEAVER_TOKEN",
        );
      }
      try {
        const data = await c.getUser(id);
        if (json) return printJson(data);
        printJson(data);
      } catch (e) {
        exitUserError(e instanceof Error ? e.message : String(e));
      }
    });

  user
    .command("create")
    .requiredOption("--login <name>", "Login name")
    .requiredOption("--password <password>", "Initial password")
    .option("--display-name <name>", "Display name")
    .option("--org <orgId>", "Organisation ID")
    .description("Create user")
    .action(async (opts: { login: string; password: string; displayName?: string; org?: string }) => {
      const json = program.opts<{ json?: boolean }>().json === true;
      const c = client(program);
      if (!c.hasToken()) {
        exitUserError(
          "No token: set KWEAVER_ADMIN_TOKEN, run `kweaver-admin auth login`, or export KWEAVER_TOKEN",
        );
      }
      try {
        const data = await c.createUser({
          login: opts.login,
          password: opts.password,
          displayName: opts.displayName,
          orgId: opts.org,
        });
        if (json) return printJson(data);
        console.log(chalk.green(`Created user: ${opts.login}`));
      } catch (e) {
        exitUserError(e instanceof Error ? e.message : String(e));
      }
    });

  user
    .command("update")
    .argument("<id>", "User id")
    .option("--display-name <name>", "Display name")
    .option("--org <orgId>", "Organisation ID")
    .description("Update user")
    .action(async (id: string, opts: { displayName?: string; org?: string }) => {
      const json = program.opts<{ json?: boolean }>().json === true;
      const c = client(program);
      if (!c.hasToken()) {
        exitUserError(
          "No token: set KWEAVER_ADMIN_TOKEN, run `kweaver-admin auth login`, or export KWEAVER_TOKEN",
        );
      }
      try {
        const data = await c.updateUser(id, { displayName: opts.displayName, orgId: opts.org });
        if (json) return printJson(data);
        console.log(chalk.green(`Updated user ${id}`));
      } catch (e) {
        exitUserError(e instanceof Error ? e.message : String(e));
      }
    });

  user
    .command("delete")
    .argument("<id>", "User id")
    .description("Delete user")
    .action(async (id: string) => {
      const c = client(program);
      if (!c.hasToken()) {
        exitUserError(
          "No token: set KWEAVER_ADMIN_TOKEN, run `kweaver-admin auth login`, or export KWEAVER_TOKEN",
        );
      }
      if (protectedAccounts.has(id.toLowerCase())) {
        console.error(
          chalk.yellow(
            `Warning: "${id}" may be a built-in account (system/admin/security/audit).`,
          ),
        );
      }
      try {
        await c.deleteUser(id);
        console.log(chalk.green(`Deleted user ${id}`));
      } catch (e) {
        exitUserError(e instanceof Error ? e.message : String(e));
      }
    });

  user
    .command("roles")
    .argument("<userId>", "User id")
    .description("List roles for a user")
    .action(async (userId: string) => {
      const json = program.opts<{ json?: boolean }>().json === true;
      const c = client(program);
      if (!c.hasToken()) {
        exitUserError(
          "No token: set KWEAVER_ADMIN_TOKEN, run `kweaver-admin auth login`, or export KWEAVER_TOKEN",
        );
      }
      try {
        const data = await c.getUserRoles(userId);
        if (json) return printJson(data);
        const items = Array.isArray(data) ? data : ((data as { data?: unknown[] }).data ?? []);
        printColumns(
          ["ROLE ID", "ROLE NAME"],
          items.map((r) => {
            const roleItem = r as { id: string; name?: string };
            return [roleItem.id, roleItem.name ?? "-"];
          }),
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        exitUserError(`Failed to fetch roles: ${msg}`);
      }
    });

  user
    .command("assign-role")
    .argument("<userId>", "User id")
    .argument("<roleId>", "Role id")
    .description("Assign an existing role to a user")
    .action(async (userId: string, roleId: string) => {
      const json = program.opts<{ json?: boolean }>().json === true;
      const c = client(program);
      if (!c.hasToken()) {
        exitUserError(
          "No token: set KWEAVER_ADMIN_TOKEN, run `kweaver-admin auth login`, or export KWEAVER_TOKEN",
        );
      }
      try {
        const data = await c.assignRole(userId, roleId);
        if (json) return printJson(data);
        console.log(chalk.green(`Assigned role ${roleId} to user ${userId}`));
      } catch (e) {
        exitUserError(e instanceof Error ? e.message : String(e));
      }
    });

  user
    .command("revoke-role")
    .argument("<userId>", "User id")
    .argument("<roleId>", "Role id")
    .description("Revoke a role from a user")
    .action(async (userId: string, roleId: string) => {
      const c = client(program);
      if (!c.hasToken()) {
        exitUserError(
          "No token: set KWEAVER_ADMIN_TOKEN, run `kweaver-admin auth login`, or export KWEAVER_TOKEN",
        );
      }
      try {
        await c.revokeRole(userId, roleId);
        console.log(chalk.green(`Revoked role ${roleId} from user ${userId}`));
      } catch (e) {
        exitUserError(e instanceof Error ? e.message : String(e));
      }
    });
}
