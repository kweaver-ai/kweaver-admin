import { createServer } from "node:http";
import type { TokenConfig } from "./types";

export const DEFAULT_REDIRECT_PORT = 4199;
export const DEFAULT_CLIENT_ID = "kweaver-admin-cli";
const DEFAULT_SCOPE = "openid offline";

function mapTokenPayload(
  data: { access_token: string; refresh_token?: string; id_token?: string; expires_in?: number },
  fallbackRefresh?: string,
): TokenConfig {
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? fallbackRefresh,
    idToken: data.id_token,
    expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined,
  };
}

export function buildAuthorizeUrl(
  baseUrl: string,
  clientId: string,
  redirectUri: string,
  state: string,
): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: DEFAULT_SCOPE,
    state,
  });
  return `${baseUrl}/oauth2/auth?${params.toString()}`;
}

export function startCallbackServer(
  port: number,
): Promise<{ code: string; state?: string; close: () => void }> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const reqUrl = new URL(req.url ?? "/", `http://localhost:${port}`);
      const code = reqUrl.searchParams.get("code");
      const state = reqUrl.searchParams.get("state") ?? undefined;
      const error = reqUrl.searchParams.get("error");

      if (error) {
        res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
        res.end(`<h1>Login failed</h1><p>${error}</p>`);
        server.close(() => reject(new Error(`OAuth error: ${error}`)));
        return;
      }

      if (!code) {
        res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Missing code parameter");
        return;
      }

      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end("<h1>Login successful</h1><p>You can close this window.</p>");
      resolve({ code, state, close: () => server.close() });
    });

    server.on("error", reject);
    server.listen(port);
  });
}

export async function exchangeCodeForToken(
  baseUrl: string,
  code: string,
  redirectUri: string,
  clientId: string,
  clientSecret?: string,
): Promise<TokenConfig> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
  });
  if (clientSecret) body.set("client_secret", clientSecret);

  const res = await fetch(`${baseUrl}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed (${res.status}): ${text || res.statusText}`);
  }

  const data = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    id_token?: string;
    expires_in?: number;
  };

  return mapTokenPayload(data);
}

export async function refreshAccessToken(
  baseUrl: string,
  refreshToken: string,
  clientId: string,
  clientSecret?: string,
): Promise<TokenConfig> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
  });
  if (clientSecret) body.set("client_secret", clientSecret);

  const res = await fetch(`${baseUrl}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token refresh failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    id_token?: string;
    expires_in?: number;
  };

  return mapTokenPayload(data, refreshToken);
}
