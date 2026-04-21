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
import { runCallCommand } from "./commands/call";
import { indexOfCallSubcommand } from "./lib/call-route";

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

async function main(): Promise<void> {
  const argv = process.argv;
  const callIdx = indexOfCallSubcommand(argv);
  if (callIdx >= 2) {
    process.exit(await runCallCommand(argv.slice(callIdx + 1)));
  }

  const program = new Command();

  program
    .name("kweaver-admin")
    .description("KWeaver administrator CLI")
    .version(readVersion())
    .option("--json", "Output JSON where supported")
    .option(
      "-k, --insecure",
      "Skip TLS certificate verification (dev only); saved per platform on auth login (kweaver-sdk style)",
    )
    .option("--base-url <url>", "Override API base URL for this invocation");

  program.hook("preAction", (thisCommand) => {
    const opts = thisCommand.optsWithGlobals<{ insecure?: boolean }>();
    const tlsEnv = /^(1|true)$/i.test(process.env.KWEAVER_TLS_INSECURE ?? "");
    if (opts.insecure || tlsEnv) {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    }
  });

  program.addHelpText(
    "after",
    `
Examples:
  kweaver-admin call /api/authorization/v1/roles -X GET
  kweaver-admin call --help
`,
  );

  registerAuthCommands(program);
  registerOrgCommands(program);
  registerUserCommands(program);
  registerRoleCommands(program);
  registerLlmCommands(program);
  registerSmallModelCommands(program);
  registerAuditCommands(program);
  registerConfigCommands(program);

  // `call` is intercepted before commander parses (it has curl-style flags
  // that conflict with commander's option parser). Register a documentation
  // stub here so `kweaver-admin --help` lists it. The stub action is never
  // hit in practice because `indexOfCallSubcommand` short-circuits above; we
  // keep it as a defensive fallback that delegates to `runCallCommand`.
  program
    .command("call")
    .description(
      "Curl-style API passthrough with auto-injected admin token headers " +
        "(see `kweaver-admin call --help`)",
    )
    .allowUnknownOption(true)
    .helpOption(false)
    .action(async () => {
      const idx = process.argv.indexOf("call");
      const tail = idx >= 0 ? process.argv.slice(idx + 1) : [];
      process.exit(await runCallCommand(tail));
    });

  program.parse();
}

void main();
