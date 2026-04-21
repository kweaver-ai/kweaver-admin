/**
 * GET /api/business-system/v1/business-domain — same contract as kweaver-sdk
 * `packages/typescript/src/api/business-domains.ts`.
 */

export interface BusinessDomain {
  id: string;
  name?: string;
  description?: string;
  creator?: string;
  products?: string[];
  create_time?: string;
}

export interface ListBusinessDomainsOptions {
  baseUrl: string;
  accessToken: string;
  tlsInsecure?: boolean;
}

async function withTlsInsecure<T>(tlsInsecure: boolean | undefined, fn: () => Promise<T>): Promise<T> {
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
 * List business domains for the authenticated user (no `x-business-domain` header).
 */
export async function listBusinessDomains(options: ListBusinessDomainsOptions): Promise<BusinessDomain[]> {
  const { baseUrl, accessToken, tlsInsecure } = options;
  const base = baseUrl.replace(/\/+$/, "");
  const url = `${base}/api/business-system/v1/business-domain`;

  return withTlsInsecure(tlsInsecure, async () => {
    const headers: Record<string, string> = {
      accept: "application/json, text/plain, */*",
      authorization: `Bearer ${accessToken}`,
      token: accessToken,
    };
    const response = await fetch(url, { method: "GET", headers });
    const body = await response.text();
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${body || response.statusText}`);
    }
    const data = JSON.parse(body) as unknown;
    if (!Array.isArray(data)) {
      throw new Error("Business domain list response was not a JSON array.");
    }
    return data.map((item) => {
      const row = item as Record<string, unknown>;
      const id = row.id;
      if (typeof id !== "string" || id.length === 0) {
        throw new Error("Business domain entry missing string id.");
      }
      return item as BusinessDomain;
    });
  });
}
