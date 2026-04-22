import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import type { Command } from "commander";
import chalk from "chalk";
import { describeAuthState, getAdminDir, resolveBaseUrl, resolveToken } from "../lib/auth";
import { persistSessionAfterLogin } from "../lib/persist-login";
import { eacpModifyPassword } from "../lib/eacp";
import { decodeJwtPayload } from "../lib/jwt";
import {
  deleteToken,
  listPlatforms,
  loadPlatformBusinessDomain,
  readClient,
  readState,
  readToken,
  writeClient,
  writeState,
  writeToken,
} from "../lib/platforms";
import {
  buildAuthorizeUrl,
  DEFAULT_REDIRECT_PORT,
  DEFAULT_SCOPE,
  exchangeCodeForToken,
  formatHttpError,
  generatePkce,
  normalizeBaseUrl,
  passwordSigninLogin,
  promptForCode,
  resolveOrRegisterClient,
  startCallbackServer,
} from "../lib/oauth";
import type { TokenConfig } from "../lib/types";
import { wantsJsonOutput } from "../lib/cli-json";
import { openBrowser } from "../lib/browser";
import { printJson } from "../utils/output";
import { promptInput } from "../utils/prompt";

interface LoginOpts {
  token?: string;
  clientId?: string;
  clientSecret?: string;
  port?: string;
  username?: string;
  password?: string;
  signinPublicKeyFile?: string;
  product?: string;
  /** Present when `--no-browser` is passed (Commander naming). */
  noBrowser?: boolean;
  /** Commander may set `browser: false` for `--no-browser` (negated flag). */
  browser?: boolean;
}

/**
 * Resolve the current session's account/login name from the saved id_token's
 * `preferred_username` (fallback `name`). Used by `auth change-password` to let
 * `-u/--account` default to the logged-in admin.
 *
 * Returns undefined when no platform is selected, no id_token is stored, the
 * JWT cannot be decoded, or neither claim is a non-empty string.
 */
export function resolveCurrentAccount(adminDir: string): string | undefined {
  const state = readState(adminDir);
  if (!state?.currentPlatform) return undefined;
  const token = readToken(adminDir, state.currentPlatform);
  if (!token) return undefined;

  const fromJwt = (raw: string | undefined): string | undefined => {
    if (!raw) return undefined;
    const payload = decodeJwtPayload(raw);
    if (!payload) return undefined;
    const candidate = payload.preferred_username ?? payload.name;
    return typeof candidate === "string" && candidate.trim() ? candidate.trim() : undefined;
  };

  return (
    fromJwt(token.idToken) ??
    fromJwt(token.accessToken) ??
    (typeof token.username === "string" && token.username.trim() ? token.username.trim() : undefined)
  );
}

export function resolveWhoamiPlatform(input: {
  urlArg?: string;
  currentPlatform?: string;
  envBaseUrl?: string;
  envToken?: string;
}): { platform: string | null; fromEnvOnly: boolean } {
  if (input.urlArg?.trim()) {
    return {
      platform: normalizeBaseUrl(input.urlArg.trim()),
      fromEnvOnly: false,
    };
  }
  if (input.envBaseUrl && input.envToken) {
    return {
      platform: normalizeBaseUrl(input.envBaseUrl),
      fromEnvOnly: true,
    };
  }
  if (input.currentPlatform) {
    return {
      platform: input.currentPlatform,
      fromEnvOnly: false,
    };
  }
  return { platform: null, fromEnvOnly: false };
}

export type PlatformEntry = {
  platform: string;
  active: boolean;
  username?: string;
  userId?: string;
  issuer?: string;
  expiresAt?: number;
  status: "valid" | "expired" | "no-expiry";
  refreshable: boolean;
  tlsInsecure: boolean;
};

/**
 * Build per-platform session entries from saved token files.
 *
 * Pure helper consumed by `auth list` (and its tests). It does not touch the
 * filesystem itself — all token / state inputs are passed in. A platform whose
 * token cannot be read is omitted, mirroring how `listPlatforms` already
 * filters folders without a `token.json`.
 *
 * Status semantics (aligned with `describeAuthState`):
 *   - `valid`     : `expiresAt` is set and in the future
 *   - `expired`   : `expiresAt` is set and in the past
 *   - `no-expiry` : `expiresAt` is missing (e.g. opaque static token)
 * `refreshable` is only meaningful when `status === "expired"` — it is true
 * when a `refreshToken` is stored, signalling that the next API call can
 * silently refresh.
 */
export function describePlatformEntries(input: {
  platforms: string[];
  currentPlatform?: string;
  readToken: (url: string) => TokenConfig | undefined;
  now?: number;
}): PlatformEntry[] {
  const now = input.now ?? Date.now();
  const out: PlatformEntry[] = [];
  for (const platform of input.platforms) {
    const token = input.readToken(platform);
    if (!token) continue;
    const payload = token.idToken ? decodeJwtPayload(token.idToken) : undefined;
    const username =
      typeof payload?.preferred_username === "string" && payload.preferred_username
        ? payload.preferred_username
        : typeof payload?.name === "string" && payload.name
          ? payload.name
          : typeof token.username === "string" && token.username
            ? token.username
            : undefined;
    const userId =
      typeof payload?.sub === "string" && payload.sub ? payload.sub : undefined;
    const issuer =
      typeof payload?.iss === "string" && payload.iss ? payload.iss : undefined;
    let status: PlatformEntry["status"];
    if (token.expiresAt === undefined) {
      status = "no-expiry";
    } else if (token.expiresAt <= now) {
      status = "expired";
    } else {
      status = "valid";
    }
    out.push({
      platform,
      active: input.currentPlatform === platform,
      username,
      userId,
      issuer,
      expiresAt: token.expiresAt,
      status,
      refreshable: status === "expired" && Boolean(token.refreshToken),
      tlsInsecure: token.tlsInsecure === true,
    });
  }
  return out;
}

/** Commander may expose `--no-browser` as `noBrowser: true` or `browser: false`. */
function isNoBrowserLogin(opts: LoginOpts): boolean {
  if (opts.noBrowser === true) return true;
  return opts.browser === false;
}

export function registerAuthCommands(program: Command): void {
  const auth = program
    .command("auth")
    .description("Authentication (tokens, status)");

  auth
    .command("login")
    .argument("[url]", "Platform URL (e.g. https://kweaver.example.com)")
    .option("--token <token>", "Provide token directly (CI / headless)")
    .option(
      "--client-id <id>",
      "Use an existing OAuth2 client_id instead of dynamic registration",
    )
    .option("--client-secret <secret>", "OAuth2 client secret (omit for public/PKCE clients)")
    .option("--port <n>", `Local callback port (default ${DEFAULT_REDIRECT_PORT})`)
    .option("-u, --username <name>", "Username for HTTP /oauth2/signin password login")
    .option("-p, --password <password>", "Password for HTTP /oauth2/signin password login")
    .option(
      "--signin-public-key-file <path>",
      "Override RSA public key (PEM) for /oauth2/signin password encryption",
    )
    .option("--product <name>", "OAuth product query (default 'adp', some deployments use 'dip')")
    .option(
      "--no-browser",
      "Do not open a browser; paste authorization code from stdin (headless servers)",
    )
    .description(
      "Log in to platform (browser OAuth2 by default; -u/-p uses HTTP /oauth2/signin)",
    )
    .action(async (url: string | undefined, loginOpts: LoginOpts) => {
      const globals = program.optsWithGlobals<{ baseUrl?: string }>();
      const rawBase =
        url?.trim() || globals.baseUrl?.trim() || resolveBaseUrl();
      const baseUrl = normalizeBaseUrl(rawBase);
      const adminDir = getAdminDir();
      const tlsLogin =
        program.optsWithGlobals<{ insecure?: boolean }>().insecure === true ||
        /^(1|true)$/i.test(process.env.KWEAVER_TLS_INSECURE ?? "");
      const mergeLoginTls = (token: TokenConfig): TokenConfig =>
        tlsLogin ? { ...token, tlsInsecure: true } : token;

      // 1. Static token: skip OAuth entirely
      if (loginOpts.token) {
        const tok = mergeLoginTls({ accessToken: loginOpts.token });
        writeToken(adminDir, baseUrl, tok);
        writeState(adminDir, { currentPlatform: baseUrl });
        console.log(chalk.green(`Token saved for ${baseUrl}`));
        await persistSessionAfterLogin(program, adminDir, baseUrl, tok);
        return;
      }

      if (isNoBrowserLogin(loginOpts) && (loginOpts.username || loginOpts.password)) {
        console.error(
          chalk.red(
            "--no-browser cannot be combined with -u/-p (HTTP sign-in is already headless).",
          ),
        );
        process.exit(1);
      }

      const port = loginOpts.port ? Number.parseInt(loginOpts.port, 10) : DEFAULT_REDIRECT_PORT;
      if (Number.isNaN(port) || port < 1 || port > 65535) {
        console.error(chalk.red("Invalid --port value (expected 1-65535)."));
        process.exit(1);
      }
      const redirectUri = `http://127.0.0.1:${port}/callback`;

      try {
        // 2. Resolve OAuth2 client (cached → preflight → re-register on stale)
        const cached = readClient(adminDir, baseUrl);
        const { client, reused, registered } = await resolveOrRegisterClient(
          baseUrl,
          redirectUri,
          DEFAULT_SCOPE,
          cached,
          { clientId: loginOpts.clientId, clientSecret: loginOpts.clientSecret },
        );
        if (registered) {
          console.log(chalk.dim(`Registered new OAuth2 client: ${client.clientId}`));
        } else if (reused) {
          console.log(chalk.dim(`Reusing OAuth2 client: ${client.clientId}`));
        }
        writeClient(adminDir, baseUrl, client);

        const usePkce = !client.clientSecret;
        const pkce = usePkce ? generatePkce() : null;

        // 3. HTTP password sign-in (no browser, RSA-encrypted password)
        if (loginOpts.username && loginOpts.password) {
          const signinPem = loginOpts.signinPublicKeyFile
            ? readFileSync(loginOpts.signinPublicKeyFile, "utf8").trim()
            : undefined;
          console.log(chalk.dim("Logging in via HTTP /oauth2/signin..."));
          const token = await passwordSigninLogin(baseUrl, {
            username: loginOpts.username,
            password: loginOpts.password,
            redirectUri,
            clientId: client.clientId,
            clientSecret: client.clientSecret || undefined,
            codeVerifier: pkce?.verifier,
            codeChallenge: pkce?.challenge,
            product: loginOpts.product,
            signinPublicKeyPem: signinPem,
          });
          const stored = mergeLoginTls({ ...token, username: loginOpts.username });
          writeToken(adminDir, baseUrl, stored);
          writeState(adminDir, { currentPlatform: baseUrl });
          console.log(chalk.green(`Logged in to ${baseUrl} as ${loginOpts.username}`));
          await persistSessionAfterLogin(program, adminDir, baseUrl, stored);
          return;
        }

        // 4. Browser OAuth2 authorization-code flow (PKCE for public clients)
        const state = randomBytes(12).toString("hex");
        const authorizeUrl = buildAuthorizeUrl(baseUrl, client.clientId, redirectUri, state, {
          scope: DEFAULT_SCOPE,
          codeChallenge: pkce?.challenge,
          product: loginOpts.product,
        });

        if (isNoBrowserLogin(loginOpts)) {
          const code = await promptForCode(authorizeUrl, state, port, "explicit");
          const token = await exchangeCodeForToken(baseUrl, code, redirectUri, client.clientId, {
            clientSecret: client.clientSecret || undefined,
            codeVerifier: pkce?.verifier,
          });
          writeToken(adminDir, baseUrl, mergeLoginTls(token));
          writeState(adminDir, { currentPlatform: baseUrl });
          console.log(chalk.green(`Logged in to ${baseUrl}`));
          await persistSessionAfterLogin(program, adminDir, baseUrl, mergeLoginTls(token));
          return;
        }

        const callbackPromise = startCallbackServer(port);
        console.log(chalk.dim(`Opening browser for login to ${baseUrl}...`));
        console.log(chalk.dim(`If browser does not open, visit:\n${authorizeUrl}`));
        const opened = await openBrowser(authorizeUrl);
        if (!opened) {
          console.log(chalk.yellow("Could not open browser automatically; copy the URL above."));
        }

        const callback = await callbackPromise;
        if (callback.state && callback.state !== state) {
          callback.close();
          throw new Error("OAuth state mismatch");
        }
        const token = await exchangeCodeForToken(baseUrl, callback.code, redirectUri, client.clientId, {
          clientSecret: client.clientSecret || undefined,
          codeVerifier: pkce?.verifier,
        });
        callback.close();
        writeToken(adminDir, baseUrl, mergeLoginTls(token));
        writeState(adminDir, { currentPlatform: baseUrl });
        console.log(chalk.green(`Logged in to ${baseUrl}`));
        await persistSessionAfterLogin(program, adminDir, baseUrl, mergeLoginTls(token));
      } catch (e) {
        console.error(chalk.red(formatHttpError(e)));
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
      const json = wantsJsonOutput(program);
      const state = describeAuthState();
      if (json) {
        const adminDir = getAdminDir();
        const st = readState(adminDir);
        const businessDomain =
          st?.currentPlatform ? loadPlatformBusinessDomain(adminDir, st.currentPlatform) : undefined;
        printJson({ ...state, businessDomain });
        return;
      }
      console.log("Base URL:", state.baseUrl);
      console.log("Token:", state.hasToken ? "configured" : "not set");
      console.log("Token source:", state.tokenSource);
      console.log("TLS insecure:", state.tlsInsecure ? "enabled" : "disabled");
      if (state.tlsInsecure) {
        console.log("TLS source:", state.tlsSource);
      }
      if (state.currentPlatform) {
        console.log("Platform:", state.currentPlatform);
        const bd = loadPlatformBusinessDomain(getAdminDir(), state.currentPlatform);
        if (bd) console.log("Business domain (saved):", bd);
      }
      if (state.expiresAt) {
        const when = new Date(state.expiresAt).toISOString();
        if (state.expired) {
          const note = state.refreshable
            ? chalk.yellow(`${when} (EXPIRED — auto-refresh on next API call)`)
            : chalk.red(`${when} (EXPIRED — run \`auth login\` to renew)`);
          console.log("Expires:", note);
        } else {
          console.log("Expires:", when);
        }
      }
    });

  auth
    .command("whoami")
    .argument("[url]", "Platform URL (defaults to current)")
    .description("Show current user identity decoded from saved id_token")
    .action((urlArg: string | undefined) => {
      const json = wantsJsonOutput(program);
      const adminDir = getAdminDir();

      const envUrlRaw =
        process.env.KWEAVER_BASE_URL?.trim() ?? process.env.KWEAVER_API_URL?.trim();
      const envTokenRaw =
        process.env.KWEAVER_ADMIN_TOKEN?.trim() ?? process.env.KWEAVER_TOKEN?.trim();
      const st = readState(adminDir);
      const { platform, fromEnvOnly } = resolveWhoamiPlatform({
        urlArg,
        currentPlatform: st?.currentPlatform,
        envBaseUrl: envUrlRaw,
        envToken: envTokenRaw,
      });

      if (!platform) {
        console.error(
          chalk.red("No active platform. Run `kweaver-admin auth login <platform-url>` first."),
        );
        process.exit(1);
      }

      if (fromEnvOnly) {
        const accessToken = envTokenRaw!.replace(/^Bearer\s+/i, "");
        const payload = decodeJwtPayload(accessToken);
        if (json) {
          printJson({ platform, source: "env", ...(payload ?? {}) });
          return;
        }
        console.log(`Platform: ${platform}`);
        console.log(`Source:   env (KWEAVER_TOKEN / KWEAVER_ADMIN_TOKEN)`);
        if (payload) {
          const uname = payload.preferred_username ?? payload.name;
          if (typeof uname === "string" && uname) console.log(`Username: ${uname}`);
          console.log(`User ID:  ${payload.sub ?? "(unknown)"}`);
          console.log(`Issuer:   ${payload.iss ?? "(unknown)"}`);
          if (payload.iat) {
            console.log(`Issued:   ${new Date((payload.iat as number) * 1000).toISOString()}`);
          }
          if (payload.exp) {
            console.log(`Expires:  ${new Date((payload.exp as number) * 1000).toISOString()}`);
          }
        } else {
          console.log(`User info unavailable: opaque access token.`);
          console.log(`Hint: run \`kweaver-admin auth login ${platform}\` to obtain a full session.`);
        }
        return;
      }

      const token = readToken(adminDir, platform);
      if (!token) {
        console.error(chalk.red(`No saved token for ${platform}.`));
        process.exit(1);
      }
      if (!token.idToken) {
        console.error(chalk.red(`No id_token saved for ${platform}. Re-login to obtain one.`));
        process.exit(1);
      }
      const payload = decodeJwtPayload(token.idToken);
      if (!payload) {
        console.error(chalk.red("Failed to decode id_token."));
        process.exit(1);
      }
      if (json) {
        printJson({ platform, ...payload });
        return;
      }
      console.log(`Platform: ${platform}`);
      const uname = payload.preferred_username ?? payload.name;
      if (typeof uname === "string" && uname) console.log(`Username: ${uname}`);
      console.log(`User ID:  ${payload.sub ?? "(unknown)"}`);
      console.log(`Issuer:   ${payload.iss ?? "(unknown)"}`);
      if (payload.sid) console.log(`Session:  ${payload.sid}`);
      if (payload.iat) {
        console.log(`Issued:   ${new Date((payload.iat as number) * 1000).toISOString()}`);
      }
      if (payload.exp) {
        console.log(`Expires:  ${new Date((payload.exp as number) * 1000).toISOString()}`);
      }
    });

  auth
    .command("list")
    .alias("ls")
    .description("List every platform with a saved session under ~/.kweaver-admin/platforms")
    .action(() => {
      const json = wantsJsonOutput(program);
      const adminDir = getAdminDir();
      const state = readState(adminDir);
      const entries = describePlatformEntries({
        platforms: listPlatforms(adminDir),
        currentPlatform: state?.currentPlatform,
        readToken: (url) => readToken(adminDir, url),
      });

      if (json) {
        printJson({ currentPlatform: state?.currentPlatform ?? null, platforms: entries });
        return;
      }

      if (entries.length === 0) {
        console.log(
          chalk.yellow("No saved platform sessions. Run `kweaver-admin auth login <platform-url>`."),
        );
        return;
      }

      for (const e of entries) {
        const marker = e.active ? chalk.green("*") : " ";
        const who =
          e.username ??
          (e.userId
            ? `${chalk.gray("uid:")}${e.userId}`
            : chalk.gray("(unknown — token has no username/sub claim; pass -u to commands)"));
        const status =
          e.status === "valid"
            ? chalk.green("valid")
            : e.status === "expired"
              ? e.refreshable
                ? chalk.yellow("expired (refreshable)")
                : chalk.red("expired")
              : chalk.gray("no-expiry");
        const expires =
          e.expiresAt !== undefined ? new Date(e.expiresAt).toISOString() : "—";
        const tls = e.tlsInsecure ? chalk.yellow(" tls:insecure") : "";
        console.log(`${marker} ${e.platform}`);
        console.log(`    user: ${who}    status: ${status}    expires: ${expires}${tls}`);
      }
      if (entries.some((e) => e.active)) {
        console.log();
        console.log(chalk.gray("(* = active platform; switch with `auth login <url>`)"));
      } else if (state?.currentPlatform) {
        console.log();
        console.log(
          chalk.gray(`(current state.json points at ${state.currentPlatform} but no token is saved)`),
        );
      }
    });

  auth
    .command("change-password")
    .argument("[url]", "Platform URL (defaults to current)")
    .option(
      "-u, --account <name>",
      "Account / login name (defaults to current session for self-change)",
    )
    .option("-o, --old-password <password>", "Old password (prompted on TTY if omitted)")
    .option("-n, --new-password <password>", "New password (prompted on TTY if omitted)")
    .option("--public-key-file <path>", "Override RSA public key (PEM) for password encryption")
    .description(
      "Change EACP account password via /api/eacp/v1/auth1/modifypassword (no token required; --account defaults to current session). " +
        "Forgot-password / vcode flow is not supported by this CLI — use the web console for password recovery.",
    )
    .action(
      async (
        url: string | undefined,
        opts: {
          account?: string;
          oldPassword?: string;
          newPassword?: string;
          publicKeyFile?: string;
        },
      ) => {
        const globals = program.optsWithGlobals<{ baseUrl?: string }>();
        const baseUrl = normalizeBaseUrl(
          url?.trim() || globals.baseUrl?.trim() || resolveBaseUrl(),
        );

        let account = opts.account?.trim();
        if (!account) {
          account = resolveCurrentAccount(getAdminDir());
          if (!account) {
            console.error(
              chalk.red(
                "Cannot determine account from saved session.",
              ),
            );
            console.error(
              chalk.gray(
                "The id_token does not carry preferred_username/name (only sub/UUID), so we cannot infer the EACP login name.",
              ),
            );
            console.error(
              chalk.gray(
                "Pass it explicitly:  kweaver-admin auth change-password -u <login-name>",
              ),
            );
            process.exit(1);
          }
        }

        let oldPassword = opts.oldPassword;
        let newPassword = opts.newPassword;
        const json = wantsJsonOutput(program);

        if (!oldPassword) {
          if (json || !process.stdin.isTTY) {
            console.error(
              chalk.red(
                "--old-password is required in non-interactive / --json mode.",
              ),
            );
            process.exit(1);
          }
          oldPassword = await promptInput(`Old password for ${account}: `, { hidden: true });
          if (!oldPassword) {
            console.error(chalk.red("Old password cannot be empty."));
            process.exit(1);
          }
        }

        if (!newPassword) {
          if (json || !process.stdin.isTTY) {
            console.error(
              chalk.red("--new-password is required in non-interactive / --json mode."),
            );
            process.exit(1);
          }
          const p1 = await promptInput("New password: ", { hidden: true });
          if (!p1) {
            console.error(chalk.red("New password cannot be empty."));
            process.exit(1);
          }
          const p2 = await promptInput("Confirm new password: ", { hidden: true });
          if (p1 !== p2) {
            console.error(chalk.red("Passwords do not match."));
            process.exit(1);
          }
          newPassword = p1;
        }

        try {
          const pem = opts.publicKeyFile
            ? readFileSync(opts.publicKeyFile, "utf8").trim()
            : undefined;
          const result = await eacpModifyPassword(baseUrl, {
            account,
            oldPassword,
            newPassword,
            publicKeyPem: pem,
          });
          if (json) {
            printJson({ status: result.status, ok: result.ok, body: result.json ?? result.body });
          }
          if (!result.ok) {
            const msg =
              (result.json as { message?: string; cause?: string } | undefined)?.message
              ?? (result.json as { cause?: string } | undefined)?.cause
              ?? result.body
              ?? `HTTP ${result.status}`;
            console.error(chalk.red(`Change password failed (HTTP ${result.status}): ${msg}`));
            process.exit(1);
          }
          if (!json) {
            console.log(chalk.green(`Password changed for ${account} on ${baseUrl}`));
            console.error(
              chalk.yellow("Next time you log in, use the new password (re-run `auth login`)."),
            );
          }
        } catch (e) {
          console.error(chalk.red(`Change password failed: ${e instanceof Error ? e.message : String(e)}`));
          process.exit(1);
        }
      },
    );

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
