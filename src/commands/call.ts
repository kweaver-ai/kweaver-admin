import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { getAdminDir, resolveBaseUrl, resolveTokenWithRefresh } from "../lib/auth";
import { effectiveTlsInsecure, runWithTlsInsecure, shouldUseInsecureTlsForPlatform } from "../lib/tls";
import { resolveBusinessDomain } from "../lib/business-domain-resolve";
import { loadConfig } from "../lib/config";
import { refreshAccessToken } from "../lib/oauth";
import { readClient, readState, readToken, writeToken } from "../lib/platforms";
import { resolveBaseUrlFromProcessArgv } from "../lib/resolve-cli-base-url";
import {
  formatCallOutput,
  formatVerboseRequest,
  injectAuthHeaders,
  parseCallArgs,
  stripSseDoneMarker,
  type CallInvocation,
} from "../lib/call-invocation";
import { formatFetchFailure } from "../lib/network-error";
import { wantsJsonFromArgv } from "../lib/cli-json";

function formatErr(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

async function tryRefreshSessionAfter401(): Promise<void> {
  const adminDir = getAdminDir();
  const state = readState(adminDir);
  const platform = state?.currentPlatform;
  if (!platform) return;
  const token = readToken(adminDir, platform);
  const client = readClient(adminDir, platform);
  if (!token?.refreshToken || !client?.clientId) return;
  const refreshed = await runWithTlsInsecure(effectiveTlsInsecure(token), () =>
    refreshAccessToken(platform, token.refreshToken!, client.clientId, client.clientSecret || undefined),
  );
  writeToken(adminDir, platform, {
    ...refreshed,
    tlsInsecure: effectiveTlsInsecure(token) || refreshed.tlsInsecure,
  });
}

async function fetchWithAuth(
  invocation: CallInvocation,
  baseUrl: string,
  accessToken: string,
  tlsInsecure: boolean,
): Promise<Response> {
  const url = invocation.url.startsWith("/")
    ? `${baseUrl.replace(/\/+$/, "")}${invocation.url}`
    : invocation.url;

  const headers = new Headers(invocation.headers);
  injectAuthHeaders(headers, accessToken, invocation.businessDomain);

  let requestBody: string | FormData | undefined = invocation.body;

  if (invocation.formFields && invocation.formFields.length > 0) {
    const form = new FormData();
    for (const field of invocation.formFields) {
      if (field.kind === "string") {
        form.append(field.name, field.value);
      } else {
        const buf = await readFile(field.path);
        form.append(field.name, new Blob([buf]), basename(field.path));
      }
    }
    requestBody = form;
  } else if (
    invocation.body !== undefined &&
    invocation.body.length > 0 &&
    !headers.has("content-type") &&
    !headers.has("Content-Type")
  ) {
    headers.set("content-type", "application/json");
  }

  if (invocation.verbose) {
    for (const line of formatVerboseRequest({ ...invocation, url, headers })) {
      console.error(line);
    }
  }

  try {
    return await runWithTlsInsecure(tlsInsecure, () =>
      fetch(url, {
        method: invocation.method,
        headers,
        body: requestBody,
      }),
    );
  } catch (e) {
    throw new Error(formatFetchFailure(url, e));
  }
}

/**
 * Curl-style HTTP with OAuth token headers (aligned with `kweaver call` in kweaver-sdk).
 */
export async function runCallCommand(args: string[]): Promise<number> {
  const argv = process.argv;
  /** `call` bypasses Commander — include `-k` / `--insecure` from argv. */
  const tlsForFetch =
    shouldUseInsecureTlsForPlatform(getAdminDir()) ||
    argv.includes("--insecure") ||
    argv.includes("-k");

  const config = loadConfig();
  const baseUrl = resolveBaseUrlFromProcessArgv(argv) ?? resolveBaseUrl(config);
  const defaultBiz = resolveBusinessDomain(baseUrl);

  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    console.log(`kweaver-admin call <url> [-X METHOD] [-H "Name: value"] [-d BODY] [-F key=value] [--json] [--pretty] [--no-pretty] [-v] [-bd value]

Call an API with curl-style flags and auto-injected token headers (Bearer + token + x-business-domain).

Options:
  <url>              API path (e.g. /api/ontology-manager/v1/knowledge-networks) or absolute URL
  -X, --request      HTTP method (default: GET)
  -H, --header       Extra header (repeatable)
  -d, --data, --data-raw   Request body (sets Content-Type: application/json if not set; implies POST if method was GET)
  -F, --form         Multipart field. -F key=value or -F key=@/path/to/file. Repeatable. Mutually exclusive with -d.
  -bd, --biz-domain  Override x-business-domain (default: env, saved login value, or bd_public)
  -v, --verbose      Print request info to stderr
  --json             Pretty-print response body as JSON (same as --pretty; also works as kweaver-admin --json call ...)
  --pretty           Pretty-print JSON output (default)
  --no-pretty        Print raw body`);
    return 0;
  }

  let invocation: CallInvocation;
  try {
    invocation = parseCallArgs(args, defaultBiz);
  } catch (error) {
    console.error(formatErr(error));
    return 1;
  }

  const runOnce = async (): Promise<{ response: Response; token: string | undefined }> => {
    const token = await resolveTokenWithRefresh(getAdminDir());
    if (!token) {
      throw new Error(
        "No token: set KWEAVER_ADMIN_TOKEN, run `kweaver-admin auth login`, or export KWEAVER_TOKEN",
      );
    }
    const response = await fetchWithAuth(invocation, baseUrl, token, tlsForFetch);
    return { response, token };
  };

  try {
    let { response } = await runOnce();
    if (response.status === 401) {
      try {
        await tryRefreshSessionAfter401();
      } catch {
        /* fall through with first 401 response */
      }
      ({ response } = await runOnce());
    }

    const rawText = await response.text();
    const text = stripSseDoneMarker(rawText, response.headers.get("content-type"));
    if (!response.ok) {
      console.error(`HTTP ${response.status}: ${text || response.statusText}`);
      return 2;
    }

    if (text) {
      const pretty =
        wantsJsonFromArgv(process.argv) || invocation.pretty;
      console.log(formatCallOutput(text, pretty));
    }
    return 0;
  } catch (error) {
    console.error(formatErr(error));
    return 1;
  }
}
