import type { Command } from "commander";

/**
 * Global `--json` is on the root program; subcommands must use `optsWithGlobals()`
 * or it is ignored (same issue as `--base-url`).
 */
export function wantsJsonOutput(program: Command): boolean {
  return program.optsWithGlobals<{ json?: boolean }>().json === true;
}

/** For `call` / `curl` which bypass `program.parse()`. */
export function wantsJsonFromArgv(argv: string[]): boolean {
  return argv.includes("--json");
}
