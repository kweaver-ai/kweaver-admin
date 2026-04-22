import type { Command } from "commander";
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

export function registerAuditCommands(program: Command): void {
  const audit = program
    .command("audit")
    .description(
      "Audit log queries (login events). Use --page/--size for paging and " +
        "--user/--start/--end to filter; combine with global --json for raw output.",
    );

  audit
    .command("list")
    .option("--page <n>", "Page number", "1")
    .option("--size <n>", "Page size", "20")
    .option("--user <name>", "Filter by user name")
    .option("--start <iso>", "Filter start time (ISO 8601)")
    .option("--end <iso>", "Filter end time (ISO 8601)")
    .description("List login audit events")
    .action(async (opts: { page: string; size: string; user?: string; start?: string; end?: string }) => {
      const json = wantsJsonOutput(program);
      const c = client(program);
      if (!c.hasToken()) {
        exitUserError(
          "No token: set KWEAVER_ADMIN_TOKEN, run `kweaver-admin auth login`, or export KWEAVER_TOKEN",
        );
      }
      try {
        const data = await c.listAuditLogs({
          page_num: Number(opts.page),
          page_size: Number(opts.size),
          user_name: opts.user,
          start_time: opts.start,
          end_time: opts.end,
        });
        if (json) {
          printJson(data);
          return;
        }
        const items = Array.isArray(data) ? data : ((data as { data?: unknown[] }).data ?? []);
        printColumns(
          ["USER", "RESULT", "TIME", "IP"],
          items.map((item) => {
            const row = item as {
              user_name?: string;
              username?: string;
              result?: string;
              status?: string;
              create_time?: string;
              login_time?: string;
              ip?: string;
            };
            return [
              row.user_name ?? row.username ?? "-",
              row.result ?? row.status ?? "-",
              row.create_time ?? row.login_time ?? "-",
              row.ip ?? "-",
            ];
          }),
          { emptyHint: "No audit logs found for the given filters." },
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const hint =
          /terminated|aborted|timeout/i.test(msg)
            ? "\n\nHint: The login-log service did not finish in time (or closed the connection). " +
              "Retry later, try a smaller --size, or check gateway/EACP availability on this cluster."
            : "";
        exitUserError(`Failed to fetch audit logs: ${msg}${hint}`);
      }
    });
}
