import type { Command } from "commander";
import chalk from "chalk";
import { getConfigPath, loadConfig, saveConfig } from "./config";
import { autoSelectBusinessDomain } from "./auto-select-business-domain";
import type { TokenConfig } from "./types";

/**
 * After a successful login: save global `baseUrl` and auto-pick + persist `businessDomain`
 * (kweaver-sdk: `saveConfig`-style + `autoSelectBusinessDomain`).
 */
export async function persistSessionAfterLogin(
  program: Command,
  adminDir: string,
  normalizedBaseUrl: string,
  token: TokenConfig,
): Promise<void> {
  const globals = program.optsWithGlobals<{ insecure?: boolean }>();
  const tlsInsecure =
    Boolean(globals.insecure) || /^(1|true)$/i.test(process.env.KWEAVER_TLS_INSECURE ?? "");
  saveConfig({ ...loadConfig(), baseUrl: normalizedBaseUrl });
  const bd = await autoSelectBusinessDomain(adminDir, normalizedBaseUrl, token.accessToken, {
    tlsInsecure,
  });
  console.log(chalk.dim(`Config file: ${getConfigPath()} (baseUrl saved)`));
  console.log(chalk.dim(`Business domain: ${bd} (saved under platform config)`));
}
