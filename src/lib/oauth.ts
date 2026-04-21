import { createServer } from "node:http";
import { createHash, publicEncrypt, randomBytes, constants as cryptoConstants } from "node:crypto";
import type { ClientConfig, TokenConfig } from "./types";

/**
 * Local OAuth2 callback port.
 *
 * Kept aligned with `kweaver-sdk` (`packages/typescript/src/auth/oauth.ts` `DEFAULT_REDIRECT_PORT`)
 * so that registered clients can be reused between `kweaver` and `kweaver-admin`.
 */
export const DEFAULT_REDIRECT_PORT = 9010;
/** Same default scope as the SDK; covers OIDC + refresh + KWeaver business APIs. */
export const DEFAULT_SCOPE = "openid offline all";

/**
 * Studioweb fixed RSA public key used by `POST /oauth2/signin` to encrypt the password
 * before submitting it to Hydra/EACP. Mirrors the SDK constant
 * (`STUDIOWEB_LOGIN_PUBLIC_KEY_PEM`) which itself originates from
 * `kweaver-ai/kweaver/deploy/auto_cofig/auto_config.sh:LOGIN_PUBLIC_KEY`.
 */
export const STUDIOWEB_LOGIN_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAsyOstgbYuubBi2PUqeVj
GKlkwVUY6w1Y8d4k116dI2SkZI8fxcjHALv77kItO4jYLVplk9gO4HAtsisnNE2o
wlYIqdmyEPMwupaeFFFcg751oiTXJiYbtX7ABzU5KQYPjRSEjMq6i5qu/mL67XTk
hvKwrC83zme66qaKApmKupDODPb0RRkutK/zHfd1zL7sciBQ6psnNadh8pE24w8O
2XVy1v2bgSNkGHABgncR7seyIg81JQ3c/Axxd6GsTztjLnlvGAlmT1TphE84mi99
fUaGD2A1u1qdIuNc+XuisFeNcUW6fct0+x97eS2eEGRr/7qxWmO/P20sFVzXc2bF
1QIDAQAB
-----END PUBLIC KEY-----`;

export function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

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

/** PKCE S256: random 48-byte verifier; SHA-256(verifier) base64url challenge. */
export function generatePkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function buildAuthorizeUrl(
  baseUrl: string,
  clientId: string,
  redirectUri: string,
  state: string,
  options?: { scope?: string; codeChallenge?: string; product?: string },
): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: options?.scope ?? DEFAULT_SCOPE,
    state,
    "x-forwarded-prefix": "",
    lang: "zh-cn",
    product: options?.product ?? "adp",
  });
  if (options?.codeChallenge) {
    params.set("code_challenge", options.codeChallenge);
    params.set("code_challenge_method", "S256");
  }
  return `${normalizeBaseUrl(baseUrl)}/oauth2/auth?${params.toString()}`;
}

export function startCallbackServer(
  port: number,
): Promise<{ code: string; state?: string; close: () => void }> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const reqUrl = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
      if (reqUrl.pathname !== "/callback") {
        res.writeHead(404);
        res.end();
        return;
      }
      const code = reqUrl.searchParams.get("code");
      const state = reqUrl.searchParams.get("state") ?? undefined;
      const error = reqUrl.searchParams.get("error");

      if (error) {
        const desc = reqUrl.searchParams.get("error_description") ?? "";
        res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
        res.end(`<h1>Login failed</h1><p>${error}</p><pre>${desc}</pre>`);
        server.close(() => reject(new Error(desc ? `OAuth ${error}: ${desc}` : `OAuth error: ${error}`)));
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
    server.listen(port, "127.0.0.1");
  });
}

/**
 * Emphasize text on stderr (bold + bright yellow) when stderr is a TTY and `NO_COLOR` is unset.
 * See https://no-color.org/
 */
function stderrEmphasis(text: string): string {
  const noColor = process.env.NO_COLOR;
  if (noColor != null && noColor !== "") {
    return text;
  }
  if (!process.stderr.isTTY) {
    return text;
  }
  return `\x1b[1;33m${text}\x1b[0m`;
}

/**
 * Headless login: read authorization code from stdin (full callback URL or raw code).
 * Used with `--no-browser`. Mirrors kweaver-sdk `promptForCode`.
 */
export async function promptForCode(
  authUrl: string,
  state: string,
  port: number,
  pasteMode: "explicit" | "fallback" = "explicit",
): Promise<string> {
  const { createInterface } = await import("node:readline");
  const stdin = process.stdin;
  const stderr = process.stderr;
  const intro =
    pasteMode === "explicit"
      ? "Open this URL on any device (use a private/incognito window if you need the full sign-in form):\n\n"
      : "Could not open a browser automatically. Open this URL on any device:\n\n";
  const pasteInstructions =
    "After login, the browser may show an error page (this is expected if nothing listens on localhost).\n" +
    "Copy the FULL URL from the address bar and paste it here, or paste only the authorization code.\n" +
    `The URL looks like: http://127.0.0.1:${port}/callback?code=THIS_PART&state=...\n\n`;
  stderr.write(
    "\n" +
      intro +
      `  ${authUrl}\n\n` +
      stderrEmphasis(pasteInstructions),
  );
  const rl = createInterface({ input: stdin, output: stderr });
  const input = await new Promise<string>((resolve, reject) => {
    let answered = false;
    rl.on("close", () => {
      if (!answered) reject(new Error("Login cancelled."));
    });
    rl.question("Paste URL or code> ", (answer) => {
      answered = true;
      rl.close();
      resolve(answer.trim());
    });
  });
  if (input.includes("code=")) {
    let url: URL;
    try {
      url = new URL(input.startsWith("http") ? input : `http://x/?${input}`);
    } catch {
      throw new Error("Could not parse the pasted URL. Paste the full callback URL or the code value.");
    }
    const receivedState = url.searchParams.get("state");
    if (receivedState && receivedState !== state) {
      throw new Error("OAuth2 state mismatch — possible CSRF attack.");
    }
    const err = url.searchParams.get("error");
    if (err) {
      const desc = url.searchParams.get("error_description") ?? "";
      throw new Error(
        desc ? `Authorization failed: ${err} — ${desc}` : `Authorization failed: ${err}`,
      );
    }
    const code = url.searchParams.get("code");
    if (!code) {
      throw new Error("No authorization code found in the pasted URL.");
    }
    return code;
  }
  if (!input) {
    throw new Error("No authorization code entered.");
  }
  return input;
}

/**
 * Dynamic OAuth2 client registration (Hydra `POST /oauth2/clients`).
 *
 * Mirrors the SDK so a single Hydra deployment serves both CLIs the same way.
 * Returns a `ClientConfig` that callers persist via `writeClient(...)`.
 */
export async function registerOAuth2Client(
  baseUrl: string,
  redirectUri: string,
  scope: string = DEFAULT_SCOPE,
  options?: { clientName?: string; description?: string },
): Promise<ClientConfig> {
  const base = normalizeBaseUrl(baseUrl);
  const logoutUri = redirectUri.replace("/callback", "/successful-logout");
  const res = await fetch(`${base}/oauth2/clients`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_name: options?.clientName ?? "kweaver-admin-cli",
      grant_types: ["authorization_code", "implicit", "refresh_token"],
      response_types: ["token id_token", "code", "token"],
      scope,
      redirect_uris: [redirectUri],
      post_logout_redirect_uris: [logoutUri],
      metadata: {
        device: {
          name: "kweaver-admin-cli",
          client_type: "web",
          description: options?.description ?? "KWeaver Admin CLI",
        },
      },
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Client registration failed (${res.status}): ${text || res.statusText}`);
  }
  const data = (await res.json()) as { client_id: string; client_secret?: string };
  return {
    clientId: data.client_id,
    clientSecret: data.client_secret ?? "",
    redirectUri,
    scope,
    baseUrl: base,
  };
}

/**
 * Pre-flight: verify a cached client_id is still recognised by Hydra. After a server reset
 * the local `client.json` becomes stale and callers must re-register; this avoids surfacing
 * `invalid_client` deep inside the browser flow.
 */
export async function isClientStillValid(
  baseUrl: string,
  clientId: string,
  redirectUri: string,
): Promise<boolean> {
  try {
    const params = new URLSearchParams({
      client_id: clientId,
      response_type: "code",
      scope: "openid",
      redirect_uri: redirectUri,
      state: "preflight",
    });
    const resp = await fetch(`${normalizeBaseUrl(baseUrl)}/oauth2/auth?${params}`, {
      redirect: "manual",
    });
    if (resp.status === 302 || resp.status === 303 || resp.status === 307) {
      const loc = resp.headers.get("location") ?? "";
      return !loc.includes("error=");
    }
    return resp.status < 400;
  } catch {
    return true;
  }
}

/**
 * Use a cached client when still valid, register one when missing or stale.
 * When `options.clientId` is provided, that client is trusted unconditionally
 * (escape hatch for deployments where `/oauth2/clients` is locked down).
 */
export async function resolveOrRegisterClient(
  baseUrl: string,
  redirectUri: string,
  scope: string,
  cached: ClientConfig | undefined,
  options?: { clientId?: string; clientSecret?: string },
): Promise<{ client: ClientConfig; reused: boolean; registered: boolean }> {
  const base = normalizeBaseUrl(baseUrl);
  if (options?.clientId) {
    return {
      client: {
        clientId: options.clientId,
        clientSecret: options.clientSecret ?? "",
        redirectUri,
        scope,
        baseUrl: base,
      },
      reused: false,
      registered: false,
    };
  }
  if (cached?.clientId) {
    const storedUri = cached.redirectUri ?? redirectUri;
    if (storedUri === redirectUri) {
      const ok = await isClientStillValid(base, cached.clientId, storedUri);
      if (ok) return { client: cached, reused: true, registered: false };
    }
  }
  const fresh = await registerOAuth2Client(base, redirectUri, scope);
  return { client: fresh, reused: false, registered: true };
}

/**
 * Same checks as kweaver-sdk `isTlsVerificationDisabledForProcess` (oauth.ts).
 */
function isTlsVerificationDisabledForProcess(): boolean {
  return (
    process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0" ||
    process.env.KWEAVER_TLS_INSECURE === "1" ||
    process.env.KWEAVER_TLS_INSECURE === "true"
  );
}

/**
 * Human-readable errors for CLI (mirrors kweaver-sdk `formatHttpError`).
 * Multi-line for Node `fetch` TLS failures so output matches `kweaver` CLI.
 */
export function formatHttpError(error: unknown): string {
  if (error instanceof Error) {
    const cause =
      "cause" in error && error.cause instanceof Error ? error.cause.message : "";
    if (cause && error.message === "fetch failed") {
      const hint = isTlsVerificationDisabledForProcess()
        ? "Hint: TLS verification is already disabled for this process. Check network reachability, TLS termination, or proxy stability."
        : "Hint: use --insecure (-k) to skip TLS verification for self-signed certificates.";
      return `${error.message}: ${cause}\n${hint}`;
    }
    return error.message;
  }
  return String(error);
}

/**
 * Exchange an authorization code for tokens.
 * - Confidential client (has secret): HTTP Basic auth.
 * - Public client (PKCE): `client_id` + `code_verifier` in the body.
 */
export async function exchangeCodeForToken(
  baseUrl: string,
  code: string,
  redirectUri: string,
  clientId: string,
  options?: { clientSecret?: string; codeVerifier?: string },
): Promise<TokenConfig> {
  const params: Record<string, string> = {
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  };
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
    Accept: "application/json",
  };
  if (options?.clientSecret) {
    headers.Authorization = `Basic ${Buffer.from(`${clientId}:${options.clientSecret}`).toString("base64")}`;
  } else {
    params.client_id = clientId;
  }
  if (options?.codeVerifier) {
    params.code_verifier = options.codeVerifier;
  }

  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/oauth2/token`, {
    method: "POST",
    headers,
    body: new URLSearchParams(params).toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed (${res.status}): ${text || res.statusText}`);
  }
  return mapTokenPayload(
    (await res.json()) as { access_token: string; refresh_token?: string; id_token?: string; expires_in?: number },
  );
}

export async function refreshAccessToken(
  baseUrl: string,
  refreshToken: string,
  clientId: string,
  clientSecret?: string,
): Promise<TokenConfig> {
  const params: Record<string, string> = {
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  };
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
    Accept: "application/json",
  };
  if (clientSecret) {
    headers.Authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
  } else {
    params.client_id = clientId;
  }
  const res = await fetch(`${normalizeBaseUrl(baseUrl)}/oauth2/token`, {
    method: "POST",
    headers,
    body: new URLSearchParams(params).toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token refresh failed (${res.status}): ${text}`);
  }
  return mapTokenPayload(
    (await res.json()) as { access_token: string; refresh_token?: string; id_token?: string; expires_in?: number },
    refreshToken,
  );
}

// ---------------------------------------------------------------------------
// HTTP password sign-in (`/oauth2/signin`) — RSA-encrypted password, no browser
// ---------------------------------------------------------------------------

function mergeCookieJar(existing: string, response: Response): string {
  const setCookies =
    typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : (() => {
          const raw = response.headers.get("set-cookie");
          return raw ? [raw] : [];
        })();
  const map = new Map<string, string>();
  for (const part of existing.split(";").map((s) => s.trim()).filter(Boolean)) {
    const eq = part.indexOf("=");
    if (eq > 0) map.set(part.slice(0, eq), part.slice(eq + 1));
  }
  for (const sc of setCookies) {
    const first = sc.split(";")[0]?.trim() ?? "";
    const eq = first.indexOf("=");
    if (eq > 0) map.set(first.slice(0, eq), first.slice(eq + 1));
  }
  return [...map.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

interface SigninPageProps {
  challenge?: string;
  csrftoken: string;
  remember?: boolean;
}

function parseSigninPageProps(html: string): SigninPageProps {
  const m = html.match(/<script[^>]*\bid=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!m) {
    throw new Error("Could not find __NEXT_DATA__ on /oauth2/signin page.");
  }
  const data = JSON.parse(m[1]) as Record<string, unknown>;
  const pageProps = (data.props as Record<string, unknown> | undefined)?.pageProps as
    | Record<string, unknown>
    | undefined;
  if (!pageProps) {
    throw new Error("Invalid __NEXT_DATA__: missing pageProps.");
  }
  const csrftoken = pageProps.csrftoken ?? pageProps._csrf;
  if (typeof csrftoken !== "string") {
    throw new Error("Sign-in page did not expose csrftoken.");
  }
  const challenge = typeof pageProps.challenge === "string" ? pageProps.challenge : undefined;
  const rememberRaw = pageProps.remember;
  const remember =
    typeof rememberRaw === "boolean"
      ? rememberRaw
      : typeof rememberRaw === "string"
        ? rememberRaw === "true"
        : undefined;
  return { challenge, csrftoken, remember };
}

async function followRedirectsUntilCallback(
  startUrl: string,
  initialJar: string,
  state: string,
  redirectUri: string,
): Promise<{ code: string; jar: string }> {
  let url = startUrl;
  let jar = initialJar;
  const callbackHost = new URL(redirectUri).origin;
  const callbackPath = new URL(redirectUri).pathname;

  for (let hop = 0; hop < 40; hop++) {
    const resp = await fetch(url, {
      method: "GET",
      headers: { Cookie: jar, Accept: "text/html,application/xhtml+xml,*/*;q=0.8" },
      redirect: "manual",
    });
    jar = mergeCookieJar(jar, resp);

    if ([302, 303, 307, 308].includes(resp.status)) {
      const loc = resp.headers.get("location");
      if (!loc) throw new Error(`OAuth redirect missing Location (HTTP ${resp.status}).`);
      const next = new URL(loc, url);
      if (next.origin === callbackHost && next.pathname === callbackPath) {
        const code = next.searchParams.get("code");
        const st = next.searchParams.get("state");
        const err = next.searchParams.get("error");
        if (err) {
          const desc = next.searchParams.get("error_description") ?? "";
          throw new Error(desc ? `Authorization failed: ${err} — ${desc}` : `Authorization failed: ${err}`);
        }
        if (st !== state) throw new Error("OAuth2 state mismatch — possible CSRF attack.");
        if (!code) throw new Error("Callback URL missing authorization code.");
        return { code, jar };
      }
      url = next.href;
      continue;
    }

    const text = await resp.text().catch(() => "");
    throw new Error(
      `Unexpected OAuth response (HTTP ${resp.status}) at ${url.slice(0, 120)}…\n${text.slice(0, 500)}`,
    );
  }
  throw new Error("Too many OAuth redirects.");
}

/**
 * Headless login via `POST /oauth2/signin` with an RSA-encrypted password (Studio web flow).
 *
 * Same wire format as the browser sign-in form; uses the fixed
 * {@link STUDIOWEB_LOGIN_PUBLIC_KEY_PEM} (override via `signinPublicKeyPem`).
 *
 * Suitable for CLI / CI use cases like `kweaver-admin auth login <url> -u admin -p eisoo.com`.
 */
export async function passwordSigninLogin(
  baseUrl: string,
  options: {
    username: string;
    password: string;
    redirectUri: string;
    clientId: string;
    clientSecret?: string;
    codeVerifier?: string;
    codeChallenge?: string;
    scope?: string;
    product?: string;
    signinPublicKeyPem?: string;
  },
): Promise<TokenConfig> {
  const base = normalizeBaseUrl(baseUrl);
  const scope = options.scope ?? DEFAULT_SCOPE;
  const state = randomBytes(12).toString("hex");
  const authUrl = buildAuthorizeUrl(base, options.clientId, options.redirectUri, state, {
    scope,
    codeChallenge: options.codeChallenge,
    product: options.product,
  });

  let jar = "";
  const authResp = await fetch(authUrl, { method: "GET", redirect: "manual" });
  jar = mergeCookieJar(jar, authResp);
  if (![302, 303, 307].includes(authResp.status)) {
    const t = await authResp.text();
    throw new Error(`/oauth2/auth did not redirect (HTTP ${authResp.status}): ${t.slice(0, 500)}`);
  }
  const authLoc = authResp.headers.get("location");
  if (!authLoc) throw new Error("/oauth2/auth response missing Location.");
  const signinUrl = new URL(authLoc, base);
  if (!signinUrl.pathname.includes("signin")) {
    throw new Error(`Expected redirect to a sign-in page, got: ${authLoc}`);
  }

  const pageResp = await fetch(signinUrl.href, {
    method: "GET",
    headers: { Cookie: jar, Accept: "text/html,application/xhtml+xml,*/*;q=0.8" },
    redirect: "manual",
  });
  jar = mergeCookieJar(jar, pageResp);
  if (pageResp.status !== 200) {
    const t = await pageResp.text();
    throw new Error(`Failed to load /oauth2/signin (HTTP ${pageResp.status}): ${t.slice(0, 500)}`);
  }
  const html = await pageResp.text();
  const parsed = parseSigninPageProps(html);
  const loginChallenge = signinUrl.searchParams.get("login_challenge")?.trim() || parsed.challenge?.trim();
  if (!loginChallenge) {
    throw new Error(
      "Could not resolve login challenge: missing in sign-in URL and __NEXT_DATA__.props.pageProps.challenge.",
    );
  }

  const pem = options.signinPublicKeyPem ?? STUDIOWEB_LOGIN_PUBLIC_KEY_PEM;
  const encrypted = publicEncrypt(
    { key: pem, padding: cryptoConstants.RSA_PKCS1_PADDING },
    Buffer.from(options.password, "utf8"),
  );
  const passwordCipher = encrypted.toString("base64");

  // Body shape matches browser POST /oauth2/signin (EACP / oauth2-ui). vcode/dualfactorauthinfo
  // are required even when empty; eachttpserver returns 400 otherwise.
  const body = {
    _csrf: parsed.csrftoken,
    challenge: loginChallenge,
    account: options.username,
    password: passwordCipher,
    vcode: { id: "", content: "" },
    dualfactorauthinfo: { validcode: { vcode: "" }, OTP: { OTP: "" } },
    remember: parsed.remember ?? false,
    // `console_web` matches `kweaver/deploy/auto_cofig/auto_config.sh` so EACP doesn't
    // reject the resulting token with "管理员已禁止此类客户端登录" (client_type whitelist).
    device: { name: "", description: "", client_type: "console_web", udids: [] },
  };

  const postResp = await fetch(`${base}/oauth2/signin`, {
    method: "POST",
    headers: {
      Cookie: jar,
      "Content-Type": "application/json",
      Accept: "application/json, text/plain, */*",
      Origin: new URL(base).origin,
      Referer: signinUrl.href,
    },
    body: JSON.stringify(body),
    redirect: "manual",
  });
  jar = mergeCookieJar(jar, postResp);

  let code: string;
  if ([302, 303, 307].includes(postResp.status)) {
    const loc = postResp.headers.get("location");
    if (!loc) throw new Error("Sign-in response missing Location.");
    ({ code } = await followRedirectsUntilCallback(new URL(loc, base).href, jar, state, options.redirectUri));
  } else if (postResp.status === 200) {
    const text = await postResp.text();
    if (/RSA_private_decrypt/i.test(text)) {
      throw new Error(
        "HTTP sign-in: server rejected RSA ciphertext. The fixed STUDIOWEB public key does not match this deployment; provide --signin-public-key-file.",
      );
    }
    let parsedJson: Record<string, unknown> | null = null;
    try {
      parsedJson = JSON.parse(text) as Record<string, unknown>;
    } catch {
      /* not JSON */
    }
    const redir = parsedJson && typeof parsedJson.redirect === "string" ? (parsedJson.redirect as string) : "";
    if (!redir) {
      const msg = parsedJson && typeof parsedJson.message === "string"
        ? (parsedJson.message as string)
        : text.slice(0, 500);
      throw new Error(`Sign-in failed: ${msg}`);
    }
    ({ code } = await followRedirectsUntilCallback(new URL(redir, base).href, jar, state, options.redirectUri));
  } else {
    const text = await postResp.text();
    throw new Error(`Sign-in failed (HTTP ${postResp.status}): ${text.slice(0, 500)}`);
  }

  return exchangeCodeForToken(base, code, options.redirectUri, options.clientId, {
    clientSecret: options.clientSecret,
    codeVerifier: options.codeVerifier,
  });
}
