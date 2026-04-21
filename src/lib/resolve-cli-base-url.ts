import type { Command } from "commander";
import type { KweaverAdminConfig } from "./config";
import { resolveBaseUrl } from "./auth";

/**
 * Global `--base-url` is registered on the root program; subcommands must use
 * `optsWithGlobals()` or it is silently ignored (Commander behavior).
 */
export function resolveCliBaseUrl(program: Command, config: KweaverAdminConfig): string {
  const g = program.optsWithGlobals<{ baseUrl?: string }>();
  const fromFlag = g.baseUrl?.trim();
  if (fromFlag) {
    return fromFlag.replace(/\/+$/, "");
  }
  return resolveBaseUrl(config);
}

/**
 * `call` / `curl` bypass Commander.parse, so scan argv for `--base-url` explicitly.
 */
export function resolveBaseUrlFromProcessArgv(argv: string[]): string | undefined {
  for (let i = 0; i < argv.length - 1; i++) {
    if (argv[i] === "--base-url") {
      const v = argv[i + 1];
      if (v && !v.startsWith("-")) {
        return v.replace(/\/+$/, "");
      }
    }
  }
  return undefined;
}
