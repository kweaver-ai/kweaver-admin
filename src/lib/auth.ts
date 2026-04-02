import { homedir } from "node:os";
import { join } from "node:path";
import type { KweaverAdminConfig } from "./config";
import { loadConfig } from "./config";
import { readClient, readState, readToken, writeToken } from "./platforms";
import { refreshAccessToken } from "./oauth";

const ADMIN_DIR = join(homedir(), ".kweaver-admin");
const DEFAULT_CLIENT_ID = "kweaver-admin-cli";

/**
 * Resolve API base URL: env > ~/.kweaver-admin/config.json > default.
 */
export function resolveBaseUrl(config?: KweaverAdminConfig): string {
  const fromEnv =
    process.env.KWEAVER_BASE_URL ?? process.env.KWEAVER_API_URL ?? undefined;
  if (fromEnv) {
    return fromEnv.replace(/\/$/, "");
  }
  const c = config ?? loadConfig();
  if (c.baseUrl) {
    return c.baseUrl.replace(/\/$/, "");
  }
  return "http://localhost:8080";
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
  if (!state?.currentPlatform) return undefined;

  const token = readToken(adminDir, state.currentPlatform);
  if (!token?.accessToken) return undefined;

  if (token.expiresAt && Date.now() > token.expiresAt && token.refreshToken) {
    const client = readClient(adminDir, state.currentPlatform);
    const clientId = client?.clientId ?? DEFAULT_CLIENT_ID;
    try {
      const refreshed = await refreshAccessToken(
        state.currentPlatform,
        token.refreshToken,
        clientId,
        client?.clientSecret,
      );
      writeToken(adminDir, state.currentPlatform, refreshed);
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

export function describeAuthState(): {
  baseUrl: string;
  hasToken: boolean;
  tokenSource: "env-admin" | "env" | "file" | "none";
  currentPlatform?: string;
  expiresAt?: number;
  expired?: boolean;
  tlsInsecure: boolean;
  tlsSource: "flag-or-node-env" | "kweaver-env" | "none";
} {
  const baseUrl = resolveBaseUrl();
  const nodeTls = process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0";
  const kweaverTls = /^(1|true)$/i.test(process.env.KWEAVER_TLS_INSECURE ?? "");
  const tlsInsecure = nodeTls || kweaverTls;
  const tlsSource = nodeTls
    ? "flag-or-node-env"
    : kweaverTls
      ? "kweaver-env"
      : "none";
  if (process.env.KWEAVER_ADMIN_TOKEN) {
    return { baseUrl, hasToken: true, tokenSource: "env-admin", tlsInsecure, tlsSource };
  }
  if (process.env.KWEAVER_TOKEN) {
    return { baseUrl, hasToken: true, tokenSource: "env", tlsInsecure, tlsSource };
  }
  const state = readState(ADMIN_DIR);
  if (state?.currentPlatform) {
    const token = readToken(ADMIN_DIR, state.currentPlatform);
    const expired = token?.expiresAt ? Date.now() > token.expiresAt : false;
    return {
      baseUrl,
      hasToken: Boolean(token?.accessToken),
      tokenSource: token?.accessToken ? "file" : "none",
      currentPlatform: state.currentPlatform,
      expiresAt: token?.expiresAt,
      expired,
      tlsInsecure,
      tlsSource,
    };
  }
  return { baseUrl, hasToken: false, tokenSource: "none", tlsInsecure, tlsSource };
}
