import { exec } from "node:child_process";
import type { Command } from "commander";
import chalk from "chalk";
import { describeAuthState, getAdminDir, resolveBaseUrl, resolveToken } from "../lib/auth";
import { deleteToken, readState, writeState, writeToken } from "../lib/platforms";
import {
  buildAuthorizeUrl,
  DEFAULT_CLIENT_ID,
  DEFAULT_REDIRECT_PORT,
  exchangeCodeForToken,
  startCallbackServer,
} from "../lib/oauth";
import { printJson } from "../utils/output";

export function registerAuthCommands(program: Command): void {
  const auth = program
    .command("auth")
    .description("Authentication (tokens, status)");

  auth
    .command("login")
    .argument("[url]", "Platform URL (e.g. https://kweaver.example.com)")
    .option("--token <token>", "Provide token directly (for CI/headless)")
    .description("Log in to platform (stores admin token in ~/.kweaver-admin)")
    .action(async (url?: string, loginOpts?: { token?: string }) => {
      const baseUrl =
        url ?? program.opts<{ baseUrl?: string }>().baseUrl ?? resolveBaseUrl();

      if (loginOpts?.token) {
        writeToken(getAdminDir(), baseUrl, { accessToken: loginOpts.token });
        writeState(getAdminDir(), { currentPlatform: baseUrl });
        console.log(chalk.green(`Token saved for ${baseUrl}`));
        return;
      }

      const port = DEFAULT_REDIRECT_PORT;
      const redirectUri = `http://localhost:${port}/callback`;
      const state = Math.random().toString(36).slice(2);
      const authorizeUrl = buildAuthorizeUrl(baseUrl, DEFAULT_CLIENT_ID, redirectUri, state);

      try {
        const callbackPromise = startCallbackServer(port);
        const openCmd =
          process.platform === "darwin"
            ? "open"
            : process.platform === "win32"
              ? "start"
              : "xdg-open";
        console.log(chalk.dim(`Opening browser for login to ${baseUrl}...`));
        console.log(chalk.dim(`If browser does not open, visit:\n${authorizeUrl}`));
        exec(`${openCmd} "${authorizeUrl}"`);

        const callback = await callbackPromise;
        if (callback.state && callback.state !== state) {
          callback.close();
          throw new Error("OAuth state mismatch");
        }
        const token = await exchangeCodeForToken(
          baseUrl,
          callback.code,
          redirectUri,
          DEFAULT_CLIENT_ID,
        );
        callback.close();
        writeToken(getAdminDir(), baseUrl, token);
        writeState(getAdminDir(), { currentPlatform: baseUrl });
        console.log(chalk.green(`Logged in to ${baseUrl}`));
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(chalk.red(`Login failed: ${msg}`));
        process.exit(1);
      }
    });

  auth
    .command("logout")
    .description("Remove stored token for current platform")
    .action(() => {
      const state = readState(getAdminDir());
      if (!state?.currentPlatform) {
        console.log(chalk.yellow("No active platform session."));
        return;
      }
      deleteToken(getAdminDir(), state.currentPlatform);
      console.log(chalk.green(`Logged out from ${state.currentPlatform}`));
    });

  auth
    .command("status")
    .description("Show base URL and whether a token is configured")
    .action(() => {
      const json = program.opts<{ json?: boolean }>().json === true;
      const state = describeAuthState();
      if (json) {
        printJson(state);
        return;
      }
      console.log("Base URL:", state.baseUrl);
      console.log("Token:", state.hasToken ? "configured" : "not set");
      console.log("Token source:", state.tokenSource);
      console.log("TLS insecure:", state.tlsInsecure ? "enabled" : "disabled");
      if (state.tlsInsecure) {
        console.log("TLS source:", state.tlsSource);
      }
      if (state.currentPlatform) console.log("Platform:", state.currentPlatform);
      if (state.expiresAt) {
        const when = new Date(state.expiresAt).toISOString();
        console.log("Expires:", state.expired ? chalk.red(`${when} (EXPIRED)`) : when);
      }
    });

  auth
    .command("token")
    .description("Print current token (stdout; keep secret)")
    .action(() => {
      const t = resolveToken();
      if (!t) {
        console.error(
          chalk.red("No token found (KWEAVER_ADMIN_TOKEN/KWEAVER_TOKEN or ~/.kweaver-admin/platforms)."),
        );
        process.exit(1);
      }
      console.error(
        chalk.yellow("Warning: token printed to stdout; avoid logs and shell history."),
      );
      console.log(t);
    });
}
