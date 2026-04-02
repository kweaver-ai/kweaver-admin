import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { registerAuthCommands } from "./commands/auth";
import { registerOrgCommands } from "./commands/org";
import { registerUserCommands } from "./commands/user";
import { registerRoleCommands } from "./commands/role";
import { registerLlmCommands } from "./commands/llm";
import { registerSmallModelCommands } from "./commands/small-model";
import { registerAuditCommands } from "./commands/audit";
import { registerConfigCommands } from "./commands/config";

const __dirname = dirname(fileURLToPath(import.meta.url));

function readVersion(): string {
  try {
    const pkgPath = join(__dirname, "..", "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { version?: string };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

const program = new Command();

program
  .name("kweaver-admin")
  .description("KWeaver administrator CLI")
  .version(readVersion())
  .option("--json", "Output JSON where supported")
  .option("-k, --insecure", "Skip TLS certificate verification (dev only)")
  .option("--base-url <url>", "Override API base URL for this invocation");

program.hook("preAction", (thisCommand) => {
  const opts = thisCommand.optsWithGlobals<{ insecure?: boolean }>();
  const tlsEnv = /^(1|true)$/i.test(process.env.KWEAVER_TLS_INSECURE ?? "");
  if (opts.insecure || tlsEnv) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  }
});

registerAuthCommands(program);
registerOrgCommands(program);
registerUserCommands(program);
registerRoleCommands(program);
registerLlmCommands(program);
registerSmallModelCommands(program);
registerAuditCommands(program);
registerConfigCommands(program);

program.parse();
