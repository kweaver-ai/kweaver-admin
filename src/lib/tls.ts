import type { TokenConfig } from "./types";
import { readState, readToken } from "./platforms";

/** Legacy field name in older token.json files. */
export function effectiveTlsInsecure(token: TokenConfig | undefined): boolean {
  if (!token) return false;
  return Boolean(token.tlsInsecure ?? token.insecure);
}

/**
 * Same idea as kweaver-sdk `runWithTlsInsecure`: temporarily set
 * `NODE_TLS_REJECT_UNAUTHORIZED=0` for the duration of `fn`.
 */
export async function runWithTlsInsecure<T>(
  tlsInsecure: boolean | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  if (!tlsInsecure) {
    return fn();
  }
  const prev = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  try {
    return await fn();
  } finally {
    if (prev === undefined) {
      delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    } else {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = prev;
    }
  }
}

/**
 * Use TLS verification skip for HTTPS calls: env, current process flag, or per-platform
 * token (`tlsInsecure` saved at `auth login -k`, aligned with kweaver-sdk).
 */
export function shouldUseInsecureTlsForPlatform(adminDir: string): boolean {
  if (/^(1|true)$/i.test(process.env.KWEAVER_TLS_INSECURE ?? "")) {
    return true;
  }
  if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0") {
    return true;
  }
  const state = readState(adminDir);
  if (!state?.currentPlatform) {
    return false;
  }
  const token = readToken(adminDir, state.currentPlatform);
  return effectiveTlsInsecure(token);
}
