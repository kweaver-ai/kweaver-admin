import type { Command } from "commander";
import chalk from "chalk";
import { ApiClient } from "../lib/api-client";
import { loadConfig } from "../lib/config";
import { resolveCliBaseUrl } from "../lib/resolve-cli-base-url";
import { printColumns, printJson } from "../utils/output";
import { exitUserError } from "../utils/errors";
import { wantsJsonOutput } from "../lib/cli-json";
import { confirm, promptInput } from "../utils/prompt";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Initial password assigned by the platform on user creation; also the value
 * used by `user reset-password` when `--password` is not supplied. */
const PLATFORM_DEFAULT_PASSWORD = "123456";

function client(program: Command): ApiClient {
  const config = loadConfig();
  const baseUrl = resolveCliBaseUrl(program, config);
  return new ApiClient({ baseUrl, config });
}

export function registerUserCommands(program: Command): void {
  const user = program.command("user").description("User management");
  const protectedAccounts = new Set(["system", "admin", "security", "audit"]);

  user
    .command("list")
    .option("--org <orgId>", "Filter by department id")
    .option("--keyword <text>", "Substring match on display name")
    .option("--limit <n>", "Page size (default 100, max 1000)")
    .option("--offset <n>", "Page offset (default 0)")
    .description("List users via UserManagement console search-users endpoint")
    .action(async (opts: { org?: string; keyword?: string; limit?: string; offset?: string }) => {
      const json = wantsJsonOutput(program);
      const c = client(program);
      if (!c.hasToken()) {
        exitUserError(
          "No token: set KWEAVER_ADMIN_TOKEN, run `kweaver-admin auth login`, or export KWEAVER_TOKEN",
        );
      }
      try {
        const data = (await c.listUsers({
          orgId: opts.org,
          keyword: opts.keyword,
          limit: opts.limit ? Number(opts.limit) : undefined,
          offset: opts.offset ? Number(opts.offset) : undefined,
        })) as { entries?: Array<Record<string, unknown>>; total_count?: number };
        if (json) return printJson(data);
        const items = data.entries ?? [];
        printColumns(
          ["ID", "ACCOUNT", "DISPLAY NAME", "EMAIL", "ENABLED"],
          items.map((u) => [
            String(u.id ?? "-"),
            String(u.account ?? "-"),
            String(u.name ?? "-"),
            String(u.email ?? "-"),
            u.enabled === false ? "no" : "yes",
          ]),
          {
            emptyHint: opts.org ? `No users in department ${opts.org}.` : "No users found.",
          },
        );
        if (typeof data.total_count === "number") {
          console.log(`(${items.length}/${data.total_count})`);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        exitUserError(msg);
      }
    });

  user
    .command("get")
    .argument("<id>", "User id")
    .description("Get user by id")
    .action(async (id: string) => {
      const json = wantsJsonOutput(program);
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
        const msg = e instanceof Error ? e.message : String(e);
        exitUserError(msg);
      }
    });

  user
    .command("create")
    .requiredOption(
      "--login <loginName>",
      "Login name (unique). Used for sign-in; corresponds to ShareMgnt.loginName",
    )
    .option(
      "--display-name <name>",
      "Human-readable display name shown in UI (defaults to --login)",
    )
    .option(
      "--department <id...>",
      'Department id(s) this user belongs to. Repeat the flag or use commas. ' +
        '(default: ["-1"], the root department)',
    )
    .option(
      "--csf-level <n>",
      "Confidentiality level (密级). Valid values are deployment-specific and " +
        "configured in UserManagement's csf_level_enum. " +
        "(default: omitted; ShareMgnt chooses/initializes a default. " +
        "Set env KWEAVER_ADMIN_CSF_LEVEL to force a value globally.)",
    )
    .option(
      "--priority <n>",
      "Display priority; lower values sort first in user lists. (default: 999)",
    )
    .option("--email <email>", "Email address (optional)")
    .option("--tel <number>", "Telephone number (optional)")
    .option("--code <code>", "Employee code / staff id (optional)")
    .option("--position <pos>", "Position / job title (optional)")
    .option("--remark <text>", "Free-form remark (optional)")
    .description(
      "Create a platform user (via ISFWeb ShareMgnt.Usrm_AddUser thrift call). " +
        "Initial password is the platform default '123456' — user must change it on first login. " +
        "To set a custom password immediately, use `kweaver-admin user reset-password -u <login> -p ...`.",
    )
    .action(
      async (opts: {
        login: string;
        displayName?: string;
        department?: string[];
        csfLevel?: string;
        priority?: string;
        email?: string;
        tel?: string;
        code?: string;
        position?: string;
        remark?: string;
      }) => {
        const json = wantsJsonOutput(program);
        const c = client(program);
        if (!c.hasToken()) {
          exitUserError(
            "No token: set KWEAVER_ADMIN_TOKEN, run `kweaver-admin auth login`, or export KWEAVER_TOKEN",
          );
        }
        const departmentIds = opts.department && opts.department.length > 0
          ? opts.department.flatMap((d) => d.split(",")).map((s) => s.trim()).filter(Boolean)
          : undefined;
        try {
          const userId = await c.createUser({
            loginName: opts.login,
            displayName: opts.displayName,
            departmentIds,
            csfLevel: opts.csfLevel !== undefined ? Number(opts.csfLevel) : undefined,
            priority: opts.priority !== undefined ? Number(opts.priority) : undefined,
            email: opts.email,
            telNumber: opts.tel,
            code: opts.code,
            position: opts.position,
            remark: opts.remark,
          });
          if (json) {
            return printJson({
              id: userId,
              loginName: opts.login,
              initialPassword: "123456",
              mustChangeOnFirstLogin: true,
            });
          }
          console.log(chalk.green(`Created user: ${opts.login}`));
          console.log(`  ID: ${userId}`);
          console.log(chalk.yellow(`  Initial password: 123456 (platform default)`));
          console.log(
            chalk.yellow(
              `  User MUST change it on first login. To set a known password immediately, run ` +
                `\`kweaver-admin user reset-password -u ${opts.login}\` (admin; optional \`-p\`).`,
            ),
          );
        } catch (e) {
          exitUserError(e instanceof Error ? e.message : String(e));
        }
      },
    );

  user
    .command("update")
    .argument("<id>", "User id")
    .option("--display-name <name>", "Display name")
    .option("--code <code>", "Employee code / staff id")
    .option("--position <pos>", "Position / job title")
    .option("--remark <text>", "Free-form remark")
    .option("--email <email>", "Email address")
    .option("--tel <number>", "Telephone number")
    .option("--manager <id>", "Manager (responsible person) user id; '' to clear")
    .option("--idcard <number>", "ID card number; '' to clear")
    .option("--priority <n>", "Display priority (lower sorts first)")
    .option("--csf-level <n>", "Confidentiality level (deployment-specific)")
    .option("--csf-level2 <n>", "Secondary confidentiality level")
    .option("--expire-time <n>", "Account expire time (epoch seconds; -1 for never)")
    .description(
      "Update mutable user fields. Uses REST PATCH when available; falls back to " +
        "ISFWeb ShareMgnt.Usrm_EditUser thrift call (same payload as the console).",
    )
    .action(async (id: string, opts: {
      displayName?: string;
      code?: string;
      position?: string;
      remark?: string;
      email?: string;
      tel?: string;
      manager?: string;
      idcard?: string;
      priority?: string;
      csfLevel?: string;
      csfLevel2?: string;
      expireTime?: string;
    }) => {
      const json = wantsJsonOutput(program);
      const c = client(program);
      if (!c.hasToken()) {
        exitUserError(
          "No token: set KWEAVER_ADMIN_TOKEN, run `kweaver-admin auth login`, or export KWEAVER_TOKEN",
        );
      }
      try {
        const data = await c.updateUser(id, {
          displayName: opts.displayName,
          code: opts.code,
          position: opts.position,
          remark: opts.remark,
          email: opts.email,
          telNumber: opts.tel,
          managerID: opts.manager,
          idcardNumber: opts.idcard === "" ? null : opts.idcard,
          priority: opts.priority !== undefined ? Number(opts.priority) : undefined,
          csfLevel: opts.csfLevel !== undefined ? Number(opts.csfLevel) : undefined,
          csfLevel2: opts.csfLevel2 !== undefined ? Number(opts.csfLevel2) : undefined,
          expireTime: opts.expireTime !== undefined ? Number(opts.expireTime) : undefined,
        });
        if (json) return printJson(data);
        console.log(chalk.green(`Updated user ${id}`));
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        exitUserError(msg);
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
    .argument("<userId>", "User UUID (find via `kweaver-admin user list`)")
    .description(
      "List roles currently granted to a user. " +
        "GET /api/authorization/v1/users/<userId>/roles. Use the returned ROLE ID with " +
        "`user assign-role` / `user revoke-role`.",
    )
    .action(async (userId: string) => {
      const json = wantsJsonOutput(program);
      const c = client(program);
      if (!c.hasToken()) {
        exitUserError(
          "No token: set KWEAVER_ADMIN_TOKEN, run `kweaver-admin auth login`, or export KWEAVER_TOKEN",
        );
      }
      try {
        const data = (await c.getUserRoles(userId)) as
          | { entries?: Array<{ id: string; name?: string; description?: string }>; total_count?: number }
          | unknown[];
        if (json) return printJson(data);
        const items = Array.isArray(data) ? data : (data.entries ?? []);
        printColumns(
          ["ROLE ID", "ROLE NAME", "DESCRIPTION"],
          items.map((r) => {
            const roleItem = r as { id: string; name?: string; description?: string };
            return [roleItem.id, roleItem.name ?? "-", roleItem.description ?? "-"];
          }),
          { emptyHint: `User ${userId} has no roles assigned.` },
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        exitUserError(`Failed to fetch roles: ${msg}`);
      }
    });

  user
    .command("assign-role")
    .argument("<userId>", "Target user UUID (find via `kweaver-admin user list`)")
    .argument("<roleId>", "Role UUID (find via `kweaver-admin role list`)")
    .description(
      "Grant one role to one user. Convenience wrapper around " +
        "POST /api/authorization/v1/role-members/<roleId> with members=[{type:'user', id:<userId>}]. " +
        "For batch / non-user members (department, group, app), use `kweaver-admin role add-member`. " +
        "Example: kweaver-admin user assign-role 11111111-... 22222222-...",
    )
    .action(async (userId: string, roleId: string) => {
      const json = wantsJsonOutput(program);
      const c = client(program);
      if (!c.hasToken()) {
        exitUserError(
          "No token: set KWEAVER_ADMIN_TOKEN, run `kweaver-admin auth login`, or export KWEAVER_TOKEN",
        );
      }
      try {
        await c.assignRole(userId, roleId);
        if (json) return printJson({ ok: true, userId, roleId, action: "assigned" });
        console.log(chalk.green(`Assigned role ${roleId} to user ${userId}`));
      } catch (e) {
        exitUserError(e instanceof Error ? e.message : String(e));
      }
    });

  user
    .command("reset-password")
    .option(
      "-u, --user <idOrAccount>",
      "User UUID or account (loginName). UUIDs are detected by format; anything else is treated as an account and resolved via search.",
    )
    .option(
      "--id <userId>",
      "Explicit user UUID. Use this when the id does not match the standard UUID format.",
    )
    .option(
      "-p, --password <new>",
      `New password. When omitted, resets to the platform default '${PLATFORM_DEFAULT_PASSWORD}' ` +
        "(or prompts interactively if --prompt-password is given).",
    )
    .option(
      "--prompt-password",
      "Prompt for the new password interactively (input is hidden) instead of passing it on the command line.",
    )
    .option("-y, --yes", "Skip the confirmation prompt")
    .description(
      `Admin password reset (defaults to '${PLATFORM_DEFAULT_PASSWORD}'). ` +
        "Old password is NOT required. Use --password / -p to set a custom one, " +
        "or --prompt-password to type it interactively.",
    )
    .action(
      async (opts: {
        user?: string;
        id?: string;
        password?: string;
        promptPassword?: boolean;
        yes?: boolean;
      }) => {
        if (opts.user && opts.id) {
          exitUserError("Use only one of --user / --id, not both.");
          return;
        }
        const idOrAccount = opts.id ?? opts.user;
        if (!idOrAccount) {
          exitUserError("Missing user reference: pass -u/--user <idOrAccount> or --id <userId>.");
          return;
        }
        const json = wantsJsonOutput(program);
        const c = client(program);
        if (!c.hasToken()) {
          exitUserError(
            "No token: set KWEAVER_ADMIN_TOKEN, run `kweaver-admin auth login`, or export KWEAVER_TOKEN",
          );
        }

        if (opts.password && opts.promptPassword) {
          exitUserError("Use only one of --password / --prompt-password, not both.");
          return;
        }
        let newPassword: string;
        if (opts.password) {
          newPassword = opts.password;
        } else if (opts.promptPassword) {
          if (json) {
            exitUserError("--prompt-password is incompatible with --json (no TTY interaction).");
            return;
          }
          newPassword = await promptInput("New password: ", { hidden: true });
          const confirmPwd = await promptInput("Confirm new password: ", { hidden: true });
          if (newPassword !== confirmPwd) {
            exitUserError("Passwords do not match.");
            return;
          }
          if (newPassword.length === 0) {
            exitUserError("Password cannot be empty.");
            return;
          }
        } else {
          newPassword = PLATFORM_DEFAULT_PASSWORD;
        }
        const usingDefault = newPassword === PLATFORM_DEFAULT_PASSWORD && !opts.password && !opts.promptPassword;

        try {
          const resolved = await resolveUserForReset(c, idOrAccount, {
            forceId: Boolean(opts.id),
          });

          const label = resolved.account
            ? `${chalk.cyan(resolved.account)} (id=${resolved.id})`
            : chalk.cyan(`id=${resolved.id}`);
          if (!opts.yes && !json) {
            const suffix = usingDefault
              ? ` to the platform default '${PLATFORM_DEFAULT_PASSWORD}'`
              : "";
            const ok = await confirm(`About to reset password for ${label}${suffix}. Continue?`);
            if (!ok) {
              console.log(chalk.yellow("Aborted."));
              return;
            }
          }

          await c.setUserPassword(resolved.id, newPassword);

          if (json) {
            return printJson({
              ok: true,
              id: resolved.id,
              account: resolved.account,
              defaultPassword: usingDefault,
            });
          }
          const suffix = usingDefault
            ? ` (set to platform default '${PLATFORM_DEFAULT_PASSWORD}'; user must change on next login)`
            : "";
          console.log(
            chalk.green(
              `Password reset for ${resolved.account ?? `id=${resolved.id}`}${suffix}`,
            ),
          );
        } catch (e) {
          exitUserError(e instanceof Error ? e.message : String(e));
        }
      },
    );

  user
    .command("revoke-role")
    .argument("<userId>", "Target user UUID (find via `kweaver-admin user list`)")
    .argument("<roleId>", "Role UUID (find via `kweaver-admin user roles <userId>` or `role list`)")
    .description(
      "Revoke one role from one user. Convenience wrapper around " +
        "DELETE /api/authorization/v1/role-members/<roleId> with members=[{type:'user', id:<userId>}]. " +
        "For batch / non-user members, use `kweaver-admin role remove-member`.",
    )
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

/**
 * Classify the `-u/--user` / `--id` argument as either a user UUID or an
 * account name. UUID-shaped strings (or anything passed via `--id`) are
 * treated as ids; everything else is an account name.
 *
 * Exported for unit tests.
 */
export function classifyUserRef(
  idOrAccount: string,
  opts: { forceId?: boolean } = {},
): { kind: "id"; id: string } | { kind: "account"; account: string } {
  if (opts.forceId || UUID_RE.test(idOrAccount)) {
    return { kind: "id", id: idOrAccount };
  }
  return { kind: "account", account: idOrAccount };
}

/**
 * Resolve a `-u/--user` / `--id` input into a concrete `{ id, account? }`
 * pair, doing a search-by-account network call when needed.
 */
async function resolveUserForReset(
  c: Pick<ApiClient, "findUserByAccount">,
  idOrAccount: string,
  opts: { forceId?: boolean } = {},
): Promise<{ id: string; account?: string }> {
  const ref = classifyUserRef(idOrAccount, opts);
  if (ref.kind === "id") return { id: ref.id };
  const found = await c.findUserByAccount(ref.account);
  if (!found) throw new Error(`User not found: ${ref.account}`);
  return { id: found.id, account: found.account };
}
