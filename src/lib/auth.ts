import { homedir } from "node:os";
import { join } from "node:path";
import type { KweaverAdminConfig } from "./config";
import { loadConfig } from "./config";
import { readClient, readState, readToken, writeToken } from "./platforms";
import { refreshAccessToken } from "./oauth";
import { effectiveTlsInsecure, runWithTlsInsecure } from "./tls";

const ADMIN_DIR = join(homedir(), ".kweaver-admin");

const DEFAULT_BASE_URL = "http://localhost:8080";

/**
 * Resolve API base URL (no CLI flags — use {@link resolveCliBaseUrl} for `--base-url`).
 *
 * Order: env > active login (`state.currentPlatform`, matches token storage) >
 * `config.json` > default.
 *
 * Session wins over config so a mistaken `config set baseUrl http://localhost:8080` does not
 * override the platform you actually logged into.
 */
export function resolveBaseUrl(config?: KweaverAdminConfig): string {
  const fromEnv =
    process.env.KWEAVER_BASE_URL ?? process.env.KWEAVER_API_URL ?? undefined;
  if (fromEnv?.trim()) {
    return fromEnv.replace(/\/$/, "");
  }

  const state = readState(ADMIN_DIR);
  const sessionUrl = state?.currentPlatform?.trim();
  if (sessionUrl) {
    return sessionUrl.replace(/\/$/, "");
  }

  const c = config ?? loadConfig();
  if (c.baseUrl?.trim()) {
    return c.baseUrl.replace(/\/$/, "");
  }

  return DEFAULT_BASE_URL;
}

export function getAdminDir(): string {
  return ADMIN_DIR;
}

export function resolveTokenFrom(adminDir: string): string | undefined {
  if (process.env.KWEAVER_ADMIN_TOKEN) return process.env.KWEAVER_ADMIN_TOKEN;
  if (process.env.KWEAVER_TOKEN) return process.env.KWEAVER_TOKEN;

  const state = readState(adminDir);
  if (!state?.currentPlatform) return undefined;

  const token = readToken(adminDir, state.currentPlatform);
  return token?.accessToken ?? undefined;
}

export function hasValidSession(adminDir: string): boolean {
  if (process.env.KWEAVER_ADMIN_TOKEN || process.env.KWEAVER_TOKEN) return true;
  const state = readState(adminDir);
  if (!state?.currentPlatform) return false;
  const token = readToken(adminDir, state.currentPlatform);
  return Boolean(token?.accessToken || token?.refreshToken);
}

export async function resolveTokenWithRefresh(adminDir: string): Promise<string | undefined> {
  if (process.env.KWEAVER_ADMIN_TOKEN) return process.env.KWEAVER_ADMIN_TOKEN;
  if (process.env.KWEAVER_TOKEN) return process.env.KWEAVER_TOKEN;

  const state = readState(adminDir);
  const platform = state?.currentPlatform;
  if (!platform) return undefined;

  const token = readToken(adminDir, platform);
  if (!token?.accessToken) return undefined;

  if (token.expiresAt && Date.now() > token.expiresAt && token.refreshToken) {
    const client = readClient(adminDir, platform);
    if (!client?.clientId) {
      // No saved OAuth client (e.g. legacy --token install). Cannot refresh — caller
      // can fall back to the still-cached access token if it is grace-period valid.
      return token.accessToken;
    }
    const refreshToken = token.refreshToken;
    if (!refreshToken) {
      return token.accessToken;
    }
    try {
      const refreshed = await runWithTlsInsecure(effectiveTlsInsecure(token), async () =>
        refreshAccessToken(platform, refreshToken, client.clientId, client.clientSecret || undefined),
      );
      writeToken(adminDir, platform, {
        ...refreshed,
        tlsInsecure: effectiveTlsInsecure(token) || refreshed.tlsInsecure,
      });
      return refreshed.accessToken;
    } catch {
      return undefined;
    }
  }

  return token.accessToken;
}

export function resolveToken(): string | undefined {
  return resolveTokenFrom(ADMIN_DIR);
}

/**
 * Caller user id ("sub" claim) extracted from the saved id_token of the active
 * platform. Returns undefined when no platform is selected, no id_token is
 * stored (e.g. login via `--token` env only), or the JWT cannot be decoded.
 *
 * Used by thrift-style endpoints (e.g. `Usrm_AddUser`) which expect the caller
 * user UUID as a separate positional parameter alongside the bearer token.
 */
export function resolveCurrentUserId(adminDir: string = ADMIN_DIR): string | undefined {
  const state = readState(adminDir);
  if (!state?.currentPlatform) return undefined;
  const token = readToken(adminDir, state.currentPlatform);
  if (!token?.idToken) return undefined;
  const parts = token.idToken.split(".");
  if (parts.length !== 3) return undefined;
  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(Buffer.from(base64, "base64").toString("utf8")) as Record<string, unknown>;
    return typeof payload.sub === "string" ? payload.sub : undefined;
  } catch {
    return undefined;
  }
}

export function describeAuthState(): {
  baseUrl: string;
  hasToken: boolean;
  tokenSource: "env-admin" | "env" | "file" | "none";
  currentPlatform?: string;
  expiresAt?: number;
  expired?: boolean;
  refreshable?: boolean;
  tlsInsecure: boolean;
  tlsSource: "flag-or-node-env" | "kweaver-env" | "saved-platform" | "none";
} {
  const baseUrl = resolveBaseUrl();
  const nodeTls = process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0";
  const kweaverTls = /^(1|true)$/i.test(process.env.KWEAVER_TLS_INSECURE ?? "");
  const state = readState(ADMIN_DIR);
  const fileToken =
    state?.currentPlatform ? readToken(ADMIN_DIR, state.currentPlatform) : undefined;
  const savedTls = effectiveTlsInsecure(fileToken);
  const tlsInsecure = nodeTls || kweaverTls || savedTls;
  const tlsSource = nodeTls
    ? "flag-or-node-env"
    : kweaverTls
      ? "kweaver-env"
      : savedTls
        ? "saved-platform"
        : "none";
  if (process.env.KWEAVER_ADMIN_TOKEN) {
    return { baseUrl, hasToken: true, tokenSource: "env-admin", tlsInsecure, tlsSource };
  }
  if (process.env.KWEAVER_TOKEN) {
    return { baseUrl, hasToken: true, tokenSource: "env", tlsInsecure, tlsSource };
  }
  if (state?.currentPlatform) {
    const token = fileToken;
    const expired = token?.expiresAt ? Date.now() > token.expiresAt : false;
    const refreshable = Boolean(token?.refreshToken);
    return {
      baseUrl,
      hasToken: Boolean(token?.accessToken),
      tokenSource: token?.accessToken ? "file" : "none",
      currentPlatform: state.currentPlatform,
      expiresAt: token?.expiresAt,
      expired,
      refreshable,
      tlsInsecure,
      tlsSource,
    };
  }
  return { baseUrl, hasToken: false, tokenSource: "none", tlsInsecure, tlsSource };
}
