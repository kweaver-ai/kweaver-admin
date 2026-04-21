import { getAdminDir } from "./auth";
import { readPlatformConfig } from "./platforms";

/**
 * Resolve tenant header: CLI/env override > per-platform saved (after login) > bd_public.
 * Mirrors kweaver-sdk `resolveBusinessDomain` + persisted `config.json` under each platform.
 */
export function resolveBusinessDomain(platformBaseUrl: string, cliBizDomain?: string): string {
  const trimmed = cliBizDomain?.trim();
  if (trimmed) return trimmed;
  const fromEnv = process.env.KWEAVER_BUSINESS_DOMAIN?.trim();
  if (fromEnv) return fromEnv;
  const fromFile = readPlatformConfig(getAdminDir(), platformBaseUrl)?.businessDomain?.trim();
  if (fromFile) return fromFile;
  return "bd_public";
}
