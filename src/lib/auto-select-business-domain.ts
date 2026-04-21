import chalk from "chalk";
import { listBusinessDomains } from "./business-domains-api";
import { loadPlatformBusinessDomain, savePlatformBusinessDomain } from "./platforms";

/**
 * After login: pick a default business domain and persist (kweaver-sdk `autoSelectBusinessDomain`).
 * Skips API when KWEAVER_BUSINESS_DOMAIN is set or platform already has businessDomain.
 */
export async function autoSelectBusinessDomain(
  adminDir: string,
  baseUrl: string,
  accessToken: string,
  options?: { tlsInsecure?: boolean },
): Promise<string> {
  if (process.env.KWEAVER_BUSINESS_DOMAIN?.trim()) {
    return process.env.KWEAVER_BUSINESS_DOMAIN.trim();
  }
  const configured = loadPlatformBusinessDomain(adminDir, baseUrl);
  if (configured) {
    return configured;
  }
  try {
    const list = await listBusinessDomains({
      baseUrl,
      accessToken,
      tlsInsecure: options?.tlsInsecure,
    });
    let selected: string;
    if (list.some((d) => d.id === "bd_public")) {
      selected = "bd_public";
    } else if (list.length > 0 && list[0].id) {
      selected = list[0].id;
    } else {
      return "bd_public";
    }
    savePlatformBusinessDomain(adminDir, baseUrl, selected);
    return selected;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(chalk.yellow(`Could not fetch business domains: ${message}. Using bd_public.`));
    return "bd_public";
  }
}
