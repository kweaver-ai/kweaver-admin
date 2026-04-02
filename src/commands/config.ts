import type { Command } from "commander";
import chalk from "chalk";
import {
  getConfigPath,
  loadConfig,
  saveConfig,
} from "../lib/config";
import { printJson } from "../utils/output";
import { exitUserError } from "../utils/errors";

export function registerConfigCommands(program: Command): void {
  const cfg = program.command("config").description("CLI configuration file");

  cfg
    .command("show")
    .description("Show current config (~/.kweaver-admin/config.json)")
    .action(() => {
      const json = program.opts<{ json?: boolean }>().json === true;
      const c = loadConfig();
      if (json) {
        printJson({ ...c, path: getConfigPath() });
        return;
      }
      console.log("Path:", getConfigPath());
      console.log(JSON.stringify(c, null, 2));
    });

  cfg
    .command("set")
    .argument("<key>", "baseUrl")
    .argument("[value]", "Value")
    .description("Set config value (only baseUrl supported for now)")
    .action((key: string, value?: string) => {
      if (key !== "baseUrl") {
        exitUserError(`Unknown key: ${key} (supported: baseUrl)`);
      }
      if (value === undefined || value === "") {
        exitUserError("Missing value for baseUrl");
      }
      const next = { ...loadConfig(), baseUrl: value };
      saveConfig(next);
      console.log(chalk.green(`Saved baseUrl to ${getConfigPath()}`));
    });
}
