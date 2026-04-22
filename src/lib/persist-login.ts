import type { Command } from "commander";
import chalk from "chalk";
import { getConfigPath, loadConfig, saveConfig } from "./config";
import { autoSelectBusinessDomain } from "./auto-select-business-domain";
import { fetchAccountByUserId, fetchEacpDisplayName } from "./eacp";
import { decodeJwtPayload } from "./jwt";
import { writeToken } from "./platforms";
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

  // Mirror kweaver-sdk: persist the EACP display name (account / name) so that
  // commands like `auth whoami`, `auth list`, and `change-password` always have
  // a usable login name even when the id_token only carries `sub` (UUID).
  // Best-effort: any failure here is silent — the session is still valid.
  if (!token.username) {
    const insecure = tlsInsecure || token.tlsInsecure;
    let displayName = await fetchEacpDisplayName(
      normalizedBaseUrl,
      token.accessToken,
      insecure,
    );
    if (!displayName && token.idToken) {
      const sub = decodeJwtPayload(token.idToken)?.sub;
      if (typeof sub === "string" && sub) {
        displayName = await fetchAccountByUserId(
          normalizedBaseUrl,
          token.accessToken,
          sub,
          insecure,
        );
      }
    }
    if (displayName) {
      writeToken(adminDir, normalizedBaseUrl, { ...token, username: displayName });
    }
  }
}
