import type { Command } from "commander";
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

export function registerRoleCommands(program: Command): void {
  const role = program.command("role").description("Role management (read-only)");

  role
    .command("list")
    .description("List all available roles")
    .action(async () => {
      const json = program.opts<{ json?: boolean }>().json === true;
      const c = client(program);
      if (!c.hasToken()) {
        exitUserError(
          "No token: set KWEAVER_ADMIN_TOKEN, run `kweaver-admin auth login`, or export KWEAVER_TOKEN",
        );
      }
      try {
        const data = await c.listRoles();
        if (json) return printJson(data);
        const items = Array.isArray(data) ? data : ((data as { data?: unknown[] }).data ?? []);
        printColumns(
          ["ID", "NAME", "DESCRIPTION"],
          items.map((r) => {
            const roleItem = r as { id: string; name?: string; description?: string };
            return [roleItem.id, roleItem.name ?? "-", roleItem.description ?? "-"];
          }),
        );
      } catch (e) {
        exitUserError(e instanceof Error ? e.message : String(e));
      }
    });
}
