# KWeaver Admin CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement four modules — Auth (token-isolated OAuth), Org (department tree CRUD), User (CRUD + role assignment), and Model (LLM + small-model CRUD & test) — wiring real KWeaver backend APIs.

**Architecture:** CLI commands in `src/commands/` delegate to `ApiClient` (thin `fetch` wrapper in `src/lib/api-client.ts`). Token storage is isolated under `~/.kweaver-admin/platforms/`. Default output is plain column-aligned text; `--json` emits structured JSON.

**Tech Stack:** TypeScript ESM, Commander.js, Node 18+ `fetch`, Vitest, tsup

**Design spec:** `docs/superpowers/specs/2026-04-01-kweaver-admin-cli-design.md`

---

## File Map

### New files

| File | Responsibility |
|------|---------------|
| `src/lib/platforms.ts` | Token storage under `~/.kweaver-admin/platforms/<base64(url)>/` — read/write/delete `token.json`, `client.json` |
| `src/lib/oauth.ts` | OAuth2 authorization code flow — start local HTTP server, open browser, exchange code for tokens, refresh |
| `src/commands/org.ts` | Org/department tree CRUD commands |
| `src/commands/llm.ts` | LLM CRUD + test commands |
| `src/commands/small-model.ts` | Small-model CRUD + test commands |
| `src/lib/__tests__/platforms.test.ts` | Unit tests for platform token storage |
| `src/lib/__tests__/auth.test.ts` | Unit tests for auth resolution |
| `src/commands/__tests__/output.test.ts` | Unit tests for output formatting |

### Modified files

| File | Changes |
|------|---------|
| `src/lib/auth.ts` | Rewrite to read from `~/.kweaver-admin/platforms/`, support `KWEAVER_ADMIN_TOKEN`, auto-refresh |
| `src/lib/api-client.ts` | Add org, user, role, LLM, small-model API methods |
| `src/lib/types.ts` | Add `TokenConfig`, `ClientConfig`, `User`, `OrgUnit`, `LlmModel`, `SmallModel` types |
| `src/utils/output.ts` | Replace bordered table with plain column-aligned text; add `printColumns` |
| `src/commands/auth.ts` | Wire login/logout/status/token to new platform storage |
| `src/commands/user.ts` | Wire real API CRUD + assign-role/revoke-role |
| `src/commands/role.ts` | Simplify to `role list` only (read-only, from API) |
| `src/index.ts` | Register `org`, `llm`, `small-model`; remove `model` |

### Removed files

| File | Reason |
|------|--------|
| `src/commands/model.ts` | Replaced by `llm.ts` + `small-model.ts` |

---

## Phase 1: Foundation — Output + Types + Token Storage

### Task 1: Replace bordered table output with plain columns

**Files:**
- Modify: `src/utils/output.ts`
- Create: `src/commands/__tests__/output.test.ts`

- [ ] **Step 1: Write test for `printColumns`**

```typescript
// src/commands/__tests__/output.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { formatColumns } from "../../utils/output";

describe("formatColumns", () => {
  it("aligns columns with padding", () => {
    const result = formatColumns(
      ["NAME", "SERIES", "UPDATED"],
      [
        ["deepseek-chat", "OpenAI", "2026-03-28"],
        ["qwen-plus", "OpenAI", "2026-03-25"],
      ],
    );
    expect(result).toContain("NAME");
    expect(result).toContain("deepseek-chat");
    const lines = result.split("\n").filter(Boolean);
    expect(lines).toHaveLength(3);
  });

  it("handles empty rows", () => {
    const result = formatColumns(["A", "B"], []);
    const lines = result.split("\n").filter(Boolean);
    expect(lines).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

```bash
npx vitest run src/commands/__tests__/output.test.ts
```

Expected: FAIL — `formatColumns` not exported.

- [ ] **Step 3: Implement `formatColumns` and update `printColumns`**

Replace `src/utils/output.ts` contents:

```typescript
export function printJson(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

export function printJsonLine(data: unknown): void {
  console.log(JSON.stringify(data));
}

export function formatColumns(
  head: string[],
  rows: (string | number)[][],
  gap = 3,
): string {
  const all = [head, ...rows.map((r) => r.map(String))];
  const widths = head.map((_, col) =>
    Math.max(...all.map((r) => (r[col] ?? "").length)),
  );
  return all
    .map((row) =>
      row.map((cell, i) => String(cell).padEnd(widths[i])).join(" ".repeat(gap)),
    )
    .join("\n");
}

export function printColumns(
  head: string[],
  rows: (string | number)[][],
): void {
  console.log(formatColumns(head, rows));
}
```

Remove `cli-table3` import. Add `printTable` as a backward-compat alias so existing callers compile until they are updated in later tasks:

```typescript
/** @deprecated Use printColumns instead */
export const printTable = printColumns;
```

- [ ] **Step 4: Run test — verify it passes**

```bash
npx vitest run src/commands/__tests__/output.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/output.ts src/commands/__tests__/output.test.ts
git commit -m "refactor: replace bordered table with plain column-aligned output"
```

---

### Task 2: Add domain types

**Files:**
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Add all new types**

Append to `src/lib/types.ts`:

```typescript
/** Platform token stored in ~/.kweaver-admin/platforms/<encoded>/token.json */
export interface TokenConfig {
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  expiresAt?: number;
  insecure?: boolean;
}

/** OAuth client stored in ~/.kweaver-admin/platforms/<encoded>/client.json */
export interface ClientConfig {
  clientId: string;
  clientSecret: string;
}

/** ~/.kweaver-admin/state.json */
export interface AdminState {
  currentPlatform?: string;
}

/** Organisation / department unit */
export interface OrgUnit {
  id: string;
  name: string;
  parentId?: string;
  children?: OrgUnit[];
}

/** User */
export interface User {
  id: string;
  login: string;
  displayName?: string;
  email?: string;
  orgId?: string;
  roles?: string[];
  createTime?: string;
  updateTime?: string;
}

/** LLM model (from mf-model-manager /llm/) */
export interface LlmModel {
  model_id: string;
  model_name: string;
  model_series: string;
  model_type: string;
  model_conf: {
    api_model: string;
    api_base: string;
    api_key: string;
  };
  icon?: string;
  create_time?: string;
  update_time?: string;
}

/** Small model (from mf-model-manager /small-model/) */
export interface SmallModel {
  model_id: string;
  model_name: string;
  model_type: "embedding" | "reranker";
  model_config: {
    api_url: string;
    api_model: string;
    api_key?: string;
  };
  batch_size?: number;
  max_tokens?: number;
  embedding_dim?: number;
  create_time?: string;
  update_time?: string;
}
```

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat: add domain types for token, org, user, llm, small-model"
```

---

### Task 3: Platform token storage

**Files:**
- Create: `src/lib/platforms.ts`
- Create: `src/lib/__tests__/platforms.test.ts`

- [ ] **Step 1: Write tests**

```typescript
// src/lib/__tests__/platforms.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  encodePlatformUrl,
  readToken,
  writeToken,
  deleteToken,
  readState,
  writeState,
} from "../platforms";

describe("platforms", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "kwa-test-"));
  });
  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("encodes URL to base64url", () => {
    const encoded = encodePlatformUrl("https://kweaver.example.com");
    expect(encoded).not.toContain("/");
    expect(encoded).not.toContain("+");
  });

  it("writes and reads token", () => {
    const token = { accessToken: "abc", refreshToken: "def" };
    writeToken(tempDir, "https://example.com", token);
    const read = readToken(tempDir, "https://example.com");
    expect(read?.accessToken).toBe("abc");
  });

  it("returns undefined for missing token", () => {
    expect(readToken(tempDir, "https://nope.com")).toBeUndefined();
  });

  it("deletes token", () => {
    writeToken(tempDir, "https://example.com", { accessToken: "x" });
    deleteToken(tempDir, "https://example.com");
    expect(readToken(tempDir, "https://example.com")).toBeUndefined();
  });

  it("reads and writes state", () => {
    writeState(tempDir, { currentPlatform: "https://a.com" });
    expect(readState(tempDir)?.currentPlatform).toBe("https://a.com");
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

```bash
npx vitest run src/lib/__tests__/platforms.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/platforms.ts`**

```typescript
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import type { TokenConfig, ClientConfig, AdminState } from "./types";

export function encodePlatformUrl(url: string): string {
  return Buffer.from(url).toString("base64url");
}

function platformDir(adminDir: string, url: string): string {
  return join(adminDir, "platforms", encodePlatformUrl(url));
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { mode: 0o700, recursive: true });
  }
}

function readJsonFile<T>(path: string): T | undefined {
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return undefined;
  }
}

function writeJsonFile(path: string, data: unknown): void {
  const dir = join(path, "..");
  ensureDir(dir);
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n", { mode: 0o600 });
}

export function readToken(
  adminDir: string,
  url: string,
): TokenConfig | undefined {
  return readJsonFile<TokenConfig>(join(platformDir(adminDir, url), "token.json"));
}

export function writeToken(
  adminDir: string,
  url: string,
  token: TokenConfig,
): void {
  writeJsonFile(join(platformDir(adminDir, url), "token.json"), token);
}

export function deleteToken(adminDir: string, url: string): void {
  const file = join(platformDir(adminDir, url), "token.json");
  if (existsSync(file)) rmSync(file);
}

export function readClient(
  adminDir: string,
  url: string,
): ClientConfig | undefined {
  return readJsonFile<ClientConfig>(
    join(platformDir(adminDir, url), "client.json"),
  );
}

export function writeClient(
  adminDir: string,
  url: string,
  client: ClientConfig,
): void {
  writeJsonFile(join(platformDir(adminDir, url), "client.json"), client);
}

export function readState(adminDir: string): AdminState | undefined {
  return readJsonFile<AdminState>(join(adminDir, "state.json"));
}

export function writeState(adminDir: string, state: AdminState): void {
  writeJsonFile(join(adminDir, "state.json"), state);
}
```

- [ ] **Step 4: Run test — verify it passes**

```bash
npx vitest run src/lib/__tests__/platforms.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/platforms.ts src/lib/__tests__/platforms.test.ts
git commit -m "feat: platform token storage for ~/.kweaver-admin/"
```

---

### Task 4: Rewrite `auth.ts` to use platform storage

**Files:**
- Modify: `src/lib/auth.ts`
- Create: `src/lib/__tests__/auth.test.ts`

- [ ] **Step 1: Write tests**

```typescript
// src/lib/__tests__/auth.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { writeToken, writeState } from "../platforms";

describe("resolveToken", () => {
  let tempDir: string;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "kwa-auth-"));
    delete process.env.KWEAVER_ADMIN_TOKEN;
    delete process.env.KWEAVER_TOKEN;
  });
  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    process.env = { ...originalEnv };
  });

  it("prefers KWEAVER_ADMIN_TOKEN env", async () => {
    process.env.KWEAVER_ADMIN_TOKEN = "admin-tok";
    const { resolveTokenFrom } = await import("../auth");
    expect(resolveTokenFrom(tempDir)).toBe("admin-tok");
  });

  it("falls back to KWEAVER_TOKEN", async () => {
    process.env.KWEAVER_TOKEN = "user-tok";
    const { resolveTokenFrom } = await import("../auth");
    expect(resolveTokenFrom(tempDir)).toBe("user-tok");
  });

  it("reads from platform storage when no env", async () => {
    writeState(tempDir, { currentPlatform: "https://test.com" });
    writeToken(tempDir, "https://test.com", { accessToken: "file-tok" });
    const { resolveTokenFrom } = await import("../auth");
    expect(resolveTokenFrom(tempDir)).toBe("file-tok");
  });

  it("returns undefined when nothing configured", async () => {
    const { resolveTokenFrom } = await import("../auth");
    expect(resolveTokenFrom(tempDir)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

```bash
npx vitest run src/lib/__tests__/auth.test.ts
```

Expected: FAIL — `resolveTokenFrom` not exported.

- [ ] **Step 3: Rewrite `src/lib/auth.ts`**

```typescript
import { homedir } from "node:os";
import { join } from "node:path";
import type { KweaverAdminConfig } from "./config";
import { loadConfig } from "./config";
import { readToken, readState, readClient, writeToken } from "./platforms";

const DEFAULT_CLIENT_ID = "kweaver-admin-cli";

const ADMIN_DIR = join(homedir(), ".kweaver-admin");

export function getAdminDir(): string {
  return ADMIN_DIR;
}

export function resolveBaseUrl(config?: KweaverAdminConfig): string {
  const fromEnv =
    process.env.KWEAVER_BASE_URL ?? process.env.KWEAVER_API_URL ?? undefined;
  if (fromEnv) return fromEnv.replace(/\/$/, "");

  const c = config ?? loadConfig();
  if (c.baseUrl) return c.baseUrl.replace(/\/$/, "");

  return "http://localhost:8080";
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

export async function resolveTokenWithRefresh(
  adminDir: string,
): Promise<string | undefined> {
  if (process.env.KWEAVER_ADMIN_TOKEN) return process.env.KWEAVER_ADMIN_TOKEN;
  if (process.env.KWEAVER_TOKEN) return process.env.KWEAVER_TOKEN;

  const state = readState(adminDir);
  if (!state?.currentPlatform) return undefined;

  const token = readToken(adminDir, state.currentPlatform);
  if (!token?.accessToken) return undefined;

  if (token.expiresAt && Date.now() > token.expiresAt && token.refreshToken) {
    const { refreshAccessToken } = await import("./oauth");
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
} {
  const baseUrl = resolveBaseUrl();

  if (process.env.KWEAVER_ADMIN_TOKEN) {
    return { baseUrl, hasToken: true, tokenSource: "env-admin" };
  }
  if (process.env.KWEAVER_TOKEN) {
    return { baseUrl, hasToken: true, tokenSource: "env" };
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
    };
  }

  return { baseUrl, hasToken: false, tokenSource: "none" };
}
```

- [ ] **Step 4: Run test — verify it passes**

```bash
npx vitest run src/lib/__tests__/auth.test.ts
```

Expected: PASS

- [ ] **Step 5: Update `ApiClient` to support async token refresh**

In `src/lib/api-client.ts`:

1. Change `private readonly token` to `private token` (mutable — refresh may update it).

2. Add `ensureFreshToken()`:

```typescript
private async ensureFreshToken(): Promise<void> {
  const { resolveTokenWithRefresh, getAdminDir } = await import("./auth");
  const fresh = await resolveTokenWithRefresh(getAdminDir());
  if (fresh) this.token = fresh;
}
```

3. In `request()`, call `ensureFreshToken()` before setting the Authorization header:

```typescript
async request(path: string, init?: RequestInit): Promise<Response> {
  await this.ensureFreshToken();
  // ... rest of existing request code
}
```

4. Add a `hasSession` field and update `hasToken()`. Import `hasValidSession` and `getAdminDir` at the top of the file (static ESM import):

```typescript
import { resolveBaseUrl, resolveToken, hasValidSession, getAdminDir } from "./auth";
```

Update the constructor and `hasToken()`:

```typescript
private hasSession: boolean;

constructor(opts: ApiClientOptions = {}) {
  this.baseUrl = opts.baseUrl ?? resolveBaseUrl(opts.config);
  this.token = opts.token ?? resolveToken();
  this.hasSession = Boolean(this.token) || hasValidSession(getAdminDir());
}

hasToken(): boolean {
  return this.hasSession;
}
```

This ensures commands don't exit with "No token" when an expired-but-refreshable session exists.

- [ ] **Step 6: Run full typecheck + test**

```bash
npm run typecheck && npm test
```

Expected: PASS (existing commands still compile — `resolveToken()` and `describeAuthState()` signatures preserved).

- [ ] **Step 7: Commit**

```bash
git add src/lib/auth.ts src/lib/api-client.ts src/lib/__tests__/auth.test.ts
git commit -m "feat: auth reads from ~/.kweaver-admin/platforms/, supports KWEAVER_ADMIN_TOKEN + auto-refresh"
```

---

## Phase 2: Auth Commands

### Task 5: Wire `auth login` (OAuth placeholder + platform save)

Full OAuth browser flow requires `src/lib/oauth.ts` with an HTTP callback server. This task implements the platform-aware login **plumbing**; the browser open + Hydra exchange will be task 6.

**Files:**
- Modify: `src/commands/auth.ts`

- [ ] **Step 1: Update auth login to accept `--base-url` and save platform state**

The login command for now prompts for a token (manual paste) and stores it. Full OAuth will be layered on top.

```typescript
// In registerAuthCommands, replace the login action:
auth
  .command("login")
  .argument("[url]", "Platform URL (e.g. https://kweaver.example.com)")
  .description("Log in to KWeaver platform (stores admin token)")
  .option("--token <token>", "Provide token directly (for CI/headless)")
  .action(async (url?: string, loginOpts?: { token?: string }) => {
    const baseUrl =
      url ??
      program.opts<{ baseUrl?: string }>().baseUrl ??
      resolveBaseUrl();

    if (loginOpts?.token) {
      writeToken(getAdminDir(), baseUrl, { accessToken: loginOpts.token });
      writeState(getAdminDir(), { currentPlatform: baseUrl });
      console.log(chalk.green(`Token saved for ${baseUrl}`));
      return;
    }

    // TODO Task 6: implement full OAuth browser flow
    console.log(chalk.yellow(
      `OAuth browser login not yet implemented.\n` +
      `Use: kweaver-admin auth login ${baseUrl} --token <your-token>\n` +
      `Or export KWEAVER_ADMIN_TOKEN=<token>`,
    ));
  });
```

Add necessary imports: `writeToken`, `writeState` from `../lib/platforms`, `getAdminDir` from `../lib/auth`.

- [ ] **Step 2: Update auth logout to clear platform token**

```typescript
auth
  .command("logout")
  .description("Remove stored admin tokens for current platform")
  .action(() => {
    const state = readState(getAdminDir());
    if (!state?.currentPlatform) {
      console.log(chalk.yellow("No active platform session."));
      return;
    }
    deleteToken(getAdminDir(), state.currentPlatform);
    console.log(chalk.green(`Logged out from ${state.currentPlatform}`));
  });
```

Add import: `readState`, `deleteToken` from `../lib/platforms`.

- [ ] **Step 3: Update auth status to show platform info**

Already uses `describeAuthState()` which now includes `currentPlatform`. Add the field to the non-JSON output:

```typescript
// After existing status output add platform + expiry:
if (state.currentPlatform) {
  console.log("Platform:", state.currentPlatform);
}
if (state.expiresAt) {
  const when = new Date(state.expiresAt).toISOString();
  console.log("Expires:", state.expired ? chalk.red(`${when} (EXPIRED)`) : when);
}
```

- [ ] **Step 4: Update auth token to use new resolver**

No changes needed — `resolveToken()` is already called and now reads from platform storage.

- [ ] **Step 5: Run typecheck + build + smoke test**

```bash
npm run typecheck && npm run build && node dist/index.js auth --help
```

Expected: shows `login`, `logout`, `status`, `token` subcommands.

```bash
node dist/index.js auth login https://test.example.com --token test123
node dist/index.js auth status
node dist/index.js auth logout
```

- [ ] **Step 6: Commit**

```bash
git add src/commands/auth.ts
git commit -m "feat: auth login/logout/status wired to platform token storage"
```

---

### Task 6: OAuth browser login flow

**Files:**
- Create: `src/lib/oauth.ts`

- [ ] **Step 1: Implement OAuth module**

```typescript
import { createServer } from "node:http";
import { URL } from "node:url";
import type { TokenConfig } from "./types";

const DEFAULT_REDIRECT_PORT = 4199;
const DEFAULT_CLIENT_ID = "kweaver-admin-cli";

export interface OAuthConfig {
  baseUrl: string;
  clientId?: string;
  clientSecret?: string;
  redirectPort?: number;
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
    throw new Error(`Token exchange failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    id_token?: string;
    expires_in?: number;
  };

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    idToken: data.id_token,
    expiresAt: data.expires_in
      ? Date.now() + data.expires_in * 1000
      : undefined,
  };
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

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? refreshToken,
    idToken: data.id_token,
    expiresAt: data.expires_in
      ? Date.now() + data.expires_in * 1000
      : undefined,
  };
}

export function startCallbackServer(
  port: number,
): Promise<{ code: string; close: () => void }> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", `http://localhost:${port}`);
      const code = url.searchParams.get("code");
      const error = url.searchParams.get("error");

      if (error) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end(`<h1>Login failed</h1><p>${error}</p>`);
        reject(new Error(`OAuth error: ${error}`));
        server.close();
        return;
      }

      if (code) {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end("<h1>Login successful</h1><p>You can close this window.</p>");
        resolve({ code, close: () => server.close() });
        return;
      }

      res.writeHead(400, { "Content-Type": "text/plain" });
      res.end("Missing code parameter");
    });

    server.listen(port, () => {});
    server.on("error", reject);
  });
}

export function buildAuthorizeUrl(
  baseUrl: string,
  clientId: string,
  redirectUri: string,
  scopes = "openid offline",
): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: scopes,
    state: Math.random().toString(36).slice(2),
  });
  return `${baseUrl}/oauth2/auth?${params}`;
}

export { DEFAULT_REDIRECT_PORT, DEFAULT_CLIENT_ID };
```

- [ ] **Step 2: Wire into auth login**

Update the TODO block in `src/commands/auth.ts` login action to use the OAuth flow:

```typescript
import {
  buildAuthorizeUrl,
  startCallbackServer,
  exchangeCodeForToken,
  DEFAULT_REDIRECT_PORT,
  DEFAULT_CLIENT_ID,
} from "../lib/oauth";
import { exec } from "node:child_process";

// Inside the login action, replace the TODO block:
const port = DEFAULT_REDIRECT_PORT;
const redirectUri = `http://localhost:${port}/callback`;
const clientId = DEFAULT_CLIENT_ID;

const authorizeUrl = buildAuthorizeUrl(baseUrl, clientId, redirectUri);

try {
  const serverPromise = startCallbackServer(port);

  console.log(chalk.dim(`Opening browser for login to ${baseUrl}...`));
  console.log(chalk.dim(`If browser doesn't open, visit:\n${authorizeUrl}`));

  const openCmd =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "start"
        : "xdg-open";
  exec(`${openCmd} "${authorizeUrl}"`);

  const { code, close } = await serverPromise;
  const token = await exchangeCodeForToken(
    baseUrl, code, redirectUri, clientId,
  );
  close();
  writeToken(getAdminDir(), baseUrl, token);
  writeState(getAdminDir(), { currentPlatform: baseUrl });
  console.log(chalk.green(`Logged in to ${baseUrl}`));
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(chalk.red(`Login failed: ${msg}`));
  process.exit(1);
}
```

- [ ] **Step 3: Run typecheck + build**

```bash
npm run typecheck && npm run build
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/lib/oauth.ts src/commands/auth.ts
git commit -m "feat: OAuth2 browser login flow for kweaver-admin auth login"
```

---

## Phase 3: Org Commands

### Task 7: Add org API methods to ApiClient

**Files:**
- Modify: `src/lib/api-client.ts`

- [ ] **Step 1: Add org methods**

```typescript
// Add to ApiClient class:

async listOrgs(): Promise<unknown> {
  const res = await this.get("/api/user-management/v1/orgs");
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

async getOrg(id: string): Promise<unknown> {
  const res = await this.get(
    `/api/user-management/v1/orgs/${encodeURIComponent(id)}`,
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

async createOrg(body: { name: string; parentId?: string }): Promise<unknown> {
  const res = await this.post("/api/user-management/v1/orgs", body);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

async updateOrg(
  id: string,
  body: { name?: string },
): Promise<unknown> {
  const res = await this.patch(
    `/api/user-management/v1/orgs/${encodeURIComponent(id)}`,
    body,
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

async deleteOrg(id: string): Promise<void> {
  const res = await this.delete(
    `/api/user-management/v1/orgs/${encodeURIComponent(id)}`,
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
}

async getOrgMembers(id: string): Promise<unknown> {
  const res = await this.get(
    `/api/user-management/v1/orgs/${encodeURIComponent(id)}/members`,
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}
```

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/lib/api-client.ts
git commit -m "feat: add org API methods to ApiClient"
```

---

### Task 8: Implement org commands

**Files:**
- Create: `src/commands/org.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Create `src/commands/org.ts`**

```typescript
import type { Command } from "commander";
import chalk from "chalk";
import { ApiClient } from "../lib/api-client";
import { loadConfig } from "../lib/config";
import { resolveBaseUrl } from "../lib/auth";
import { printJson, printColumns } from "../utils/output";
import { exitUserError } from "../utils/errors";
import type { OrgUnit } from "../lib/types";

function client(program: Command): ApiClient {
  const opts = program.opts<{ baseUrl?: string }>();
  const config = loadConfig();
  const baseUrl = opts.baseUrl ?? resolveBaseUrl(config);
  return new ApiClient({ baseUrl, config });
}

function requireToken(c: ApiClient): void {
  if (!c.hasToken()) {
    exitUserError(
      "No token: set KWEAVER_ADMIN_TOKEN, run `kweaver-admin auth login`, or export KWEAVER_TOKEN",
    );
  }
}

function buildTree(flat: OrgUnit[]): OrgUnit[] {
  const map = new Map<string, OrgUnit & { children: OrgUnit[] }>();
  for (const item of flat) map.set(item.id, { ...item, children: [] });
  const roots: OrgUnit[] = [];
  for (const item of flat) {
    const node = map.get(item.id)!;
    if (item.parentId && map.has(item.parentId)) {
      map.get(item.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

function renderTree(nodes: OrgUnit[], prefix = ""): string {
  const lines: string[] = [];
  nodes.forEach((node, i) => {
    const isLast = i === nodes.length - 1;
    const connector = isLast ? "└── " : "├── ";
    const childPrefix = isLast ? "    " : "│   ";
    lines.push(`${prefix}${connector}${node.name} (id: ${node.id})`);
    if (node.children?.length) {
      lines.push(renderTree(node.children, prefix + childPrefix));
    }
  });
  return lines.join("\n");
}

export function registerOrgCommands(program: Command): void {
  const org = program.command("org").description("Organisation / department management");

  org
    .command("list")
    .description("List organisations")
    .action(async () => {
      const json = program.opts<{ json?: boolean }>().json === true;
      const c = client(program);
      requireToken(c);
      try {
        const data = await c.listOrgs();
        if (json) { printJson(data); return; }
        const items = Array.isArray(data) ? data : (data as { data?: unknown[] }).data ?? [];
        printColumns(
          ["ID", "NAME", "PARENT"],
          items.map((o: OrgUnit) => [o.id, o.name, o.parentId ?? "-"]),
        );
      } catch (e) {
        exitUserError(e instanceof Error ? e.message : String(e));
      }
    });

  org
    .command("tree")
    .description("Display full org hierarchy as tree")
    .action(async () => {
      const json = program.opts<{ json?: boolean }>().json === true;
      const c = client(program);
      requireToken(c);
      try {
        const data = await c.listOrgs();
        const items = Array.isArray(data) ? data : (data as { data?: unknown[] }).data ?? [];
        const tree = buildTree(items as OrgUnit[]);
        if (json) { printJson(tree); return; }
        if (!items.length) { console.log("(no organisations)"); return; }
        console.log(renderTree(tree));
      } catch (e) {
        exitUserError(e instanceof Error ? e.message : String(e));
      }
    });

  org
    .command("get")
    .argument("<id>", "Organisation ID")
    .description("Get organisation details")
    .action(async (id: string) => {
      const json = program.opts<{ json?: boolean }>().json === true;
      const c = client(program);
      requireToken(c);
      try {
        const data = await c.getOrg(id);
        if (json) { printJson(data); return; }
        printJson(data);
      } catch (e) {
        exitUserError(e instanceof Error ? e.message : String(e));
      }
    });

  org
    .command("create")
    .requiredOption("--name <name>", "Department name")
    .option("--parent <id>", "Parent department ID")
    .description("Create a department")
    .action(async (opts: { name: string; parent?: string }) => {
      const json = program.opts<{ json?: boolean }>().json === true;
      const c = client(program);
      requireToken(c);
      try {
        const data = await c.createOrg({
          name: opts.name,
          parentId: opts.parent,
        });
        if (json) { printJson(data); return; }
        console.log(chalk.green(`Created: ${opts.name}`));
      } catch (e) {
        exitUserError(e instanceof Error ? e.message : String(e));
      }
    });

  org
    .command("update")
    .argument("<id>", "Department ID")
    .requiredOption("--name <name>", "New name")
    .description("Update a department")
    .action(async (id: string, opts: { name: string }) => {
      const json = program.opts<{ json?: boolean }>().json === true;
      const c = client(program);
      requireToken(c);
      try {
        const data = await c.updateOrg(id, { name: opts.name });
        if (json) { printJson(data); return; }
        console.log(chalk.green(`Updated ${id}`));
      } catch (e) {
        exitUserError(e instanceof Error ? e.message : String(e));
      }
    });

  org
    .command("delete")
    .argument("<id>", "Department ID")
    .description("Delete a department")
    .action(async (id: string) => {
      const c = client(program);
      requireToken(c);
      try {
        await c.deleteOrg(id);
        console.log(chalk.green(`Deleted ${id}`));
      } catch (e) {
        exitUserError(e instanceof Error ? e.message : String(e));
      }
    });

  org
    .command("members")
    .argument("<id>", "Department ID")
    .description("List members of a department")
    .action(async (id: string) => {
      const json = program.opts<{ json?: boolean }>().json === true;
      const c = client(program);
      requireToken(c);
      try {
        const data = await c.getOrgMembers(id);
        if (json) { printJson(data); return; }
        const items = Array.isArray(data) ? data : (data as { data?: unknown[] }).data ?? [];
        printColumns(
          ["ID", "LOGIN", "DISPLAY NAME"],
          items.map((u: { id: string; login: string; displayName?: string }) => [
            u.id, u.login, u.displayName ?? "-",
          ]),
        );
      } catch (e) {
        exitUserError(e instanceof Error ? e.message : String(e));
      }
    });
}
```

- [ ] **Step 2: Register in `src/index.ts`**

Add import and call:

```typescript
import { registerOrgCommands } from "./commands/org";
// After registerAuthCommands:
registerOrgCommands(program);
```

- [ ] **Step 3: Run typecheck + build + smoke test**

```bash
npm run typecheck && npm run build && node dist/index.js org --help
```

Expected: shows `list`, `tree`, `get`, `create`, `update`, `delete`, `members`.

- [ ] **Step 4: Commit**

```bash
git add src/commands/org.ts src/index.ts
git commit -m "feat: org CRUD commands with tree view"
```

---

## Phase 4: User + Role Commands

### Task 9: Add user and role API methods to ApiClient

**Files:**
- Modify: `src/lib/api-client.ts`

**Note:** `getUserRoles(userId)` already exists in `api-client.ts` from the initial scaffold. Keep it; the new methods below are additions.

- [ ] **Step 1: Add methods**

```typescript
// Add to ApiClient class (getUserRoles already exists — keep it):

async listUsers(orgId?: string): Promise<unknown> {
  const params = orgId ? `?orgId=${encodeURIComponent(orgId)}` : "";
  const res = await this.get(`/api/user-management/v1/users${params}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

async getUser(id: string): Promise<unknown> {
  const res = await this.get(
    `/api/user-management/v1/users/${encodeURIComponent(id)}`,
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

async createUser(body: {
  login: string;
  password: string;
  displayName?: string;
  orgId?: string;
}): Promise<unknown> {
  const res = await this.post("/api/user-management/v1/users", body);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

async updateUser(
  id: string,
  body: { displayName?: string; orgId?: string },
): Promise<unknown> {
  const res = await this.patch(
    `/api/user-management/v1/users/${encodeURIComponent(id)}`,
    body,
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

async deleteUser(id: string): Promise<void> {
  const res = await this.delete(
    `/api/user-management/v1/users/${encodeURIComponent(id)}`,
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
}

async assignRole(userId: string, roleId: string): Promise<unknown> {
  const res = await this.post(
    `/api/user-management/v1/users/${encodeURIComponent(userId)}/roles`,
    { roleId },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

async revokeRole(userId: string, roleId: string): Promise<void> {
  const res = await this.delete(
    `/api/user-management/v1/users/${encodeURIComponent(userId)}/roles/${encodeURIComponent(roleId)}`,
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
}

async listRoles(): Promise<unknown> {
  const res = await this.get("/api/user-management/v1/roles");
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}
```

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/lib/api-client.ts
git commit -m "feat: add user, role API methods to ApiClient"
```

---

### Task 10: Rewrite user commands

**Files:**
- Modify: `src/commands/user.ts`

- [ ] **Step 1: Replace full file contents**

```typescript
import type { Command } from "commander";
import chalk from "chalk";
import { ApiClient } from "../lib/api-client";
import { loadConfig } from "../lib/config";
import { resolveBaseUrl } from "../lib/auth";
import { printJson, printColumns } from "../utils/output";
import { exitUserError } from "../utils/errors";

const PROTECTED_ACCOUNTS = ["system", "admin", "security", "audit"];

function client(program: Command): ApiClient {
  const opts = program.opts<{ baseUrl?: string }>();
  const config = loadConfig();
  const baseUrl = opts.baseUrl ?? resolveBaseUrl(config);
  return new ApiClient({ baseUrl, config });
}

function requireToken(c: ApiClient): void {
  if (!c.hasToken()) {
    exitUserError(
      "No token: set KWEAVER_ADMIN_TOKEN, run `kweaver-admin auth login`, or export KWEAVER_TOKEN",
    );
  }
}

export function registerUserCommands(program: Command): void {
  const user = program.command("user").description("User management");

  user
    .command("list")
    .option("--org <orgId>", "Filter by organisation ID")
    .description("List users")
    .action(async (opts: { org?: string }) => {
      const json = program.opts<{ json?: boolean }>().json === true;
      const c = client(program);
      requireToken(c);
      try {
        const data = await c.listUsers(opts.org);
        if (json) { printJson(data); return; }
        const items = Array.isArray(data) ? data : (data as { data?: unknown[] }).data ?? [];
        printColumns(
          ["ID", "LOGIN", "DISPLAY NAME", "UPDATED"],
          items.map((u: { id: string; login: string; displayName?: string; updateTime?: string }) => [
            u.id, u.login, u.displayName ?? "-", u.updateTime ?? "-",
          ]),
        );
      } catch (e) {
        exitUserError(e instanceof Error ? e.message : String(e));
      }
    });

  user
    .command("get")
    .argument("<id>", "User ID")
    .description("Get user details")
    .action(async (id: string) => {
      const json = program.opts<{ json?: boolean }>().json === true;
      const c = client(program);
      requireToken(c);
      try {
        const data = await c.getUser(id);
        if (json) { printJson(data); return; }
        printJson(data);
      } catch (e) {
        exitUserError(e instanceof Error ? e.message : String(e));
      }
    });

  user
    .command("create")
    .requiredOption("--login <name>", "Login name")
    .requiredOption("--password <pw>", "Initial password")
    .option("--display-name <dn>", "Display name")
    .option("--org <orgId>", "Organisation ID")
    .description("Create a user")
    .action(async (opts: {
      login: string;
      password: string;
      displayName?: string;
      org?: string;
    }) => {
      const json = program.opts<{ json?: boolean }>().json === true;
      const c = client(program);
      requireToken(c);
      try {
        const data = await c.createUser({
          login: opts.login,
          password: opts.password,
          displayName: opts.displayName,
          orgId: opts.org,
        });
        if (json) { printJson(data); return; }
        console.log(chalk.green(`Created user: ${opts.login}`));
      } catch (e) {
        exitUserError(e instanceof Error ? e.message : String(e));
      }
    });

  user
    .command("update")
    .argument("<id>", "User ID")
    .option("--display-name <dn>", "Display name")
    .option("--org <orgId>", "Organisation ID")
    .description("Update a user")
    .action(async (id: string, opts: { displayName?: string; org?: string }) => {
      const json = program.opts<{ json?: boolean }>().json === true;
      const c = client(program);
      requireToken(c);
      try {
        const data = await c.updateUser(id, {
          displayName: opts.displayName,
          orgId: opts.org,
        });
        if (json) { printJson(data); return; }
        console.log(chalk.green(`Updated user ${id}`));
      } catch (e) {
        exitUserError(e instanceof Error ? e.message : String(e));
      }
    });

  user
    .command("delete")
    .argument("<id>", "User ID")
    .description("Delete a user")
    .action(async (id: string) => {
      const c = client(program);
      requireToken(c);
      if (PROTECTED_ACCOUNTS.some((name) => id.toLowerCase() === name)) {
        console.error(
          chalk.yellow(`Warning: "${id}" is a built-in account (三权分立). Deletion may be rejected by the server.`),
        );
      }
      try {
        await c.deleteUser(id);
        console.log(chalk.green(`Deleted user ${id}`));
      } catch (e) {
        exitUserError(e instanceof Error ? e.message : String(e));
      }
    });

  user
    .command("roles")
    .argument("<userId>", "User ID")
    .description("List roles assigned to a user")
    .action(async (userId: string) => {
      const json = program.opts<{ json?: boolean }>().json === true;
      const c = client(program);
      requireToken(c);
      try {
        const data = await c.getUserRoles(userId);
        if (json) { printJson(data); return; }
        const items = Array.isArray(data) ? data : (data as { data?: unknown[] }).data ?? [];
        printColumns(
          ["ROLE ID", "ROLE NAME"],
          items.map((r: { id: string; name?: string }) => [r.id, r.name ?? "-"]),
        );
      } catch (e) {
        exitUserError(e instanceof Error ? e.message : String(e));
      }
    });

  user
    .command("assign-role")
    .argument("<userId>", "User ID")
    .argument("<roleId>", "Role ID to assign")
    .description("Assign an existing role to a user")
    .action(async (userId: string, roleId: string) => {
      const json = program.opts<{ json?: boolean }>().json === true;
      const c = client(program);
      requireToken(c);
      try {
        const data = await c.assignRole(userId, roleId);
        if (json) { printJson(data); return; }
        console.log(chalk.green(`Assigned role ${roleId} to user ${userId}`));
      } catch (e) {
        exitUserError(e instanceof Error ? e.message : String(e));
      }
    });

  user
    .command("revoke-role")
    .argument("<userId>", "User ID")
    .argument("<roleId>", "Role ID to revoke")
    .description("Remove a role from a user")
    .action(async (userId: string, roleId: string) => {
      const c = client(program);
      requireToken(c);
      try {
        await c.revokeRole(userId, roleId);
        console.log(chalk.green(`Revoked role ${roleId} from user ${userId}`));
      } catch (e) {
        exitUserError(e instanceof Error ? e.message : String(e));
      }
    });
}
```

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/commands/user.ts
git commit -m "feat: wire user CRUD + assign-role/revoke-role commands"
```

---

### Task 11: Simplify role commands

**Files:**
- Modify: `src/commands/role.ts`

- [ ] **Step 1: Replace with API-backed list only**

```typescript
import type { Command } from "commander";
import { ApiClient } from "../lib/api-client";
import { loadConfig } from "../lib/config";
import { resolveBaseUrl } from "../lib/auth";
import { printJson, printColumns } from "../utils/output";
import { exitUserError } from "../utils/errors";

function client(program: Command): ApiClient {
  const opts = program.opts<{ baseUrl?: string }>();
  const config = loadConfig();
  const baseUrl = opts.baseUrl ?? resolveBaseUrl(config);
  return new ApiClient({ baseUrl, config });
}

export function registerRoleCommands(program: Command): void {
  const role = program.command("role").description("Role management (read-only)");

  role
    .command("list")
    .description("List all available roles")
    .action(async () => {
      const json = program.opts<{ json?: boolean }>().json === true;
      const c = client(program);
      if (!c.hasToken()) {
        exitUserError(
          "No token: set KWEAVER_ADMIN_TOKEN, run `kweaver-admin auth login`, or export KWEAVER_TOKEN",
        );
      }
      try {
        const data = await c.listRoles();
        if (json) { printJson(data); return; }
        const items = Array.isArray(data) ? data : (data as { data?: unknown[] }).data ?? [];
        printColumns(
          ["ID", "NAME", "DESCRIPTION"],
          items.map((r: { id: string; name?: string; description?: string }) => [
            r.id, r.name ?? "-", r.description ?? "-",
          ]),
        );
      } catch (e) {
        exitUserError(e instanceof Error ? e.message : String(e));
      }
    });
}
```

- [ ] **Step 2: Run typecheck + build + smoke**

```bash
npm run typecheck && npm run build && node dist/index.js role --help
```

Expected: shows only `list` subcommand.

- [ ] **Step 3: Commit**

```bash
git add src/commands/role.ts
git commit -m "refactor: simplify role to read-only list (assign/revoke moved to user)"
```

---

## Phase 5: LLM Commands

### Task 12: Add LLM API methods to ApiClient

**Files:**
- Modify: `src/lib/api-client.ts`

- [ ] **Step 1: Add methods**

```typescript
// Add to ApiClient class:

async llmList(params?: {
  page?: number;
  size?: number;
  series?: string;
  name?: string;
}): Promise<unknown> {
  const qs = new URLSearchParams();
  if (params?.page) qs.set("page", String(params.page));
  if (params?.size) qs.set("size", String(params.size));
  if (params?.series) qs.set("series", params.series);
  if (params?.name) qs.set("name", params.name);
  const q = qs.toString();
  const res = await this.get(
    `/api/mf-model-manager/llm/list${q ? `?${q}` : ""}`,
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

async llmGet(modelId: string): Promise<unknown> {
  const res = await this.get(
    `/api/mf-model-manager/llm/get?model_id=${encodeURIComponent(modelId)}`,
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

async llmAdd(body: {
  model_name: string;
  model_series: string;
  model_conf: { api_model: string; api_base: string; api_key: string };
  model_type?: string;
  icon?: string;
}): Promise<unknown> {
  const res = await this.post("/api/mf-model-manager/llm/add", body);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

async llmEdit(body: {
  model_id: string;
  model_name?: string;
  icon?: string;
}): Promise<unknown> {
  const res = await this.post("/api/mf-model-manager/llm/edit", body);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

async llmDelete(modelIds: string[]): Promise<unknown> {
  const res = await this.post("/api/mf-model-manager/llm/delete", {
    model_ids: modelIds,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

async llmTest(body: { model_id: string }): Promise<unknown> {
  const res = await this.post("/api/mf-model-manager/llm/test", body);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}
```

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/lib/api-client.ts
git commit -m "feat: add LLM API methods to ApiClient"
```

---

### Task 13: Implement LLM commands

**Files:**
- Create: `src/commands/llm.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Create `src/commands/llm.ts`**

```typescript
import type { Command } from "commander";
import chalk from "chalk";
import { ApiClient } from "../lib/api-client";
import { loadConfig } from "../lib/config";
import { resolveBaseUrl } from "../lib/auth";
import { printJson, printColumns } from "../utils/output";
import { exitUserError } from "../utils/errors";
import type { LlmModel } from "../lib/types";

function client(program: Command): ApiClient {
  const opts = program.opts<{ baseUrl?: string }>();
  const config = loadConfig();
  const baseUrl = opts.baseUrl ?? resolveBaseUrl(config);
  return new ApiClient({ baseUrl, config });
}

function requireToken(c: ApiClient): void {
  if (!c.hasToken()) {
    exitUserError(
      "No token: set KWEAVER_ADMIN_TOKEN, run `kweaver-admin auth login`, or export KWEAVER_TOKEN",
    );
  }
}

export function registerLlmCommands(program: Command): void {
  const llm = program.command("llm").description("Large language model management");

  llm
    .command("list")
    .option("--page <n>", "Page number", "1")
    .option("--size <n>", "Page size", "20")
    .option("--series <s>", "Filter by series (AISHU|OpenAI)")
    .option("--name <n>", "Filter by name")
    .description("List LLM models")
    .action(async (opts: {
      page: string;
      size: string;
      series?: string;
      name?: string;
    }) => {
      const json = program.opts<{ json?: boolean }>().json === true;
      const c = client(program);
      requireToken(c);
      try {
        const data = await c.llmList({
          page: Number(opts.page),
          size: Number(opts.size),
          series: opts.series,
          name: opts.name,
        });
        if (json) { printJson(data); return; }
        const res = data as { data?: LlmModel[]; total?: number };
        const items = res.data ?? [];
        printColumns(
          ["NAME", "SERIES", "MODEL", "UPDATED"],
          items.map((m) => [
            m.model_name,
            m.model_series,
            m.model_conf?.api_model ?? "-",
            m.update_time ?? "-",
          ]),
        );
      } catch (e) {
        exitUserError(e instanceof Error ? e.message : String(e));
      }
    });

  llm
    .command("get")
    .argument("<modelId>", "Model ID")
    .description("Get LLM model details")
    .action(async (modelId: string) => {
      const json = program.opts<{ json?: boolean }>().json === true;
      const c = client(program);
      requireToken(c);
      try {
        const data = await c.llmGet(modelId);
        if (json) { printJson(data); return; }
        printJson(data);
      } catch (e) {
        exitUserError(e instanceof Error ? e.message : String(e));
      }
    });

  llm
    .command("add")
    .requiredOption("--name <n>", "Model name")
    .requiredOption("--series <s>", "Series (AISHU|OpenAI)")
    .requiredOption("--api-model <m>", "API model identifier")
    .requiredOption("--api-base <url>", "API base URL")
    .requiredOption("--api-key <key>", "API key")
    .option("--icon <url>", "Icon URL")
    .description("Add a new LLM model")
    .action(async (opts: {
      name: string;
      series: string;
      apiModel: string;
      apiBase: string;
      apiKey: string;
      icon?: string;
    }) => {
      const json = program.opts<{ json?: boolean }>().json === true;
      const c = client(program);
      requireToken(c);
      try {
        const data = await c.llmAdd({
          model_name: opts.name,
          model_series: opts.series,
          model_conf: {
            api_model: opts.apiModel,
            api_base: opts.apiBase,
            api_key: opts.apiKey,
          },
          icon: opts.icon,
        });
        if (json) { printJson(data); return; }
        console.log(chalk.green(`Added LLM: ${opts.name}`));
      } catch (e) {
        exitUserError(e instanceof Error ? e.message : String(e));
      }
    });

  llm
    .command("edit")
    .argument("<modelId>", "Model ID")
    .option("--name <n>", "New name")
    .option("--icon <url>", "New icon URL")
    .description("Edit an LLM model")
    .action(async (modelId: string, opts: { name?: string; icon?: string }) => {
      const json = program.opts<{ json?: boolean }>().json === true;
      const c = client(program);
      requireToken(c);
      try {
        const data = await c.llmEdit({
          model_id: modelId,
          model_name: opts.name,
          icon: opts.icon,
        });
        if (json) { printJson(data); return; }
        console.log(chalk.green(`Updated LLM ${modelId}`));
      } catch (e) {
        exitUserError(e instanceof Error ? e.message : String(e));
      }
    });

  llm
    .command("delete")
    .argument("<modelId...>", "Model ID(s) to delete")
    .description("Delete LLM model(s)")
    .action(async (modelIds: string[]) => {
      const json = program.opts<{ json?: boolean }>().json === true;
      const c = client(program);
      requireToken(c);
      try {
        const data = await c.llmDelete(modelIds);
        if (json) { printJson(data); return; }
        console.log(chalk.green(`Deleted ${modelIds.length} model(s)`));
      } catch (e) {
        exitUserError(e instanceof Error ? e.message : String(e));
      }
    });

  llm
    .command("test")
    .argument("<modelId>", "Model ID to test")
    .description("Test an LLM model (sends a short chat completion)")
    .action(async (modelId: string) => {
      const json = program.opts<{ json?: boolean }>().json === true;
      const c = client(program);
      requireToken(c);
      try {
        const data = await c.llmTest({ model_id: modelId });
        if (json) { printJson(data); return; }
        const result = data as { res?: string; [k: string]: unknown };
        console.log(`Model:   ${modelId}`);
        console.log(`Status:  ${result.res === "success" ? chalk.green("OK") : chalk.red("FAIL")}`);
      } catch (e) {
        exitUserError(e instanceof Error ? e.message : String(e));
      }
    });
}
```

- [ ] **Step 2: Register in `src/index.ts`**

```typescript
import { registerLlmCommands } from "./commands/llm";
// After other registerXCommands:
registerLlmCommands(program);
```

- [ ] **Step 3: Run typecheck + build + smoke**

```bash
npm run typecheck && npm run build && node dist/index.js llm --help
```

Expected: shows `list`, `get`, `add`, `edit`, `delete`, `test`.

- [ ] **Step 4: Commit**

```bash
git add src/commands/llm.ts src/index.ts
git commit -m "feat: LLM CRUD + test commands"
```

---

## Phase 6: Small Model Commands

### Task 14: Add small-model API methods to ApiClient

**Files:**
- Modify: `src/lib/api-client.ts`

- [ ] **Step 1: Add methods**

```typescript
// Add to ApiClient class:

async smallModelList(params?: {
  page?: number;
  size?: number;
  model_type?: string;
  model_name?: string;
}): Promise<unknown> {
  const qs = new URLSearchParams();
  if (params?.page) qs.set("page", String(params.page));
  if (params?.size) qs.set("size", String(params.size));
  if (params?.model_type) qs.set("model_type", params.model_type);
  if (params?.model_name) qs.set("model_name", params.model_name);
  const q = qs.toString();
  const res = await this.get(
    `/api/mf-model-manager/small-model/list${q ? `?${q}` : ""}`,
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

async smallModelGet(modelId: string): Promise<unknown> {
  const res = await this.get(
    `/api/mf-model-manager/small-model/get?model_id=${encodeURIComponent(modelId)}`,
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

async smallModelAdd(body: {
  model_name: string;
  model_type: string;
  model_config: { api_url: string; api_model: string; api_key?: string };
  batch_size?: number;
  max_tokens?: number;
  embedding_dim?: number;
}): Promise<unknown> {
  const res = await this.post("/api/mf-model-manager/small-model/add", body);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

async smallModelEdit(body: {
  model_id: string;
  model_name?: string;
  model_type?: string;
  model_config?: { api_url?: string; api_model?: string; api_key?: string };
  batch_size?: number;
  max_tokens?: number;
  embedding_dim?: number;
}): Promise<unknown> {
  const res = await this.post("/api/mf-model-manager/small-model/edit", body);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

async smallModelDelete(modelIds: string[]): Promise<unknown> {
  const res = await this.post("/api/mf-model-manager/small-model/delete", {
    model_ids: modelIds,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

async smallModelTest(body: { model_id: string }): Promise<unknown> {
  const res = await this.post("/api/mf-model-manager/small-model/test", body);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}
```

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/lib/api-client.ts
git commit -m "feat: add small-model API methods to ApiClient"
```

---

### Task 15: Implement small-model commands

**Files:**
- Create: `src/commands/small-model.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Create `src/commands/small-model.ts`**

```typescript
import type { Command } from "commander";
import chalk from "chalk";
import { ApiClient } from "../lib/api-client";
import { loadConfig } from "../lib/config";
import { resolveBaseUrl } from "../lib/auth";
import { printJson, printColumns } from "../utils/output";
import { exitUserError } from "../utils/errors";
import type { SmallModel } from "../lib/types";

function client(program: Command): ApiClient {
  const opts = program.opts<{ baseUrl?: string }>();
  const config = loadConfig();
  const baseUrl = opts.baseUrl ?? resolveBaseUrl(config);
  return new ApiClient({ baseUrl, config });
}

function requireToken(c: ApiClient): void {
  if (!c.hasToken()) {
    exitUserError(
      "No token: set KWEAVER_ADMIN_TOKEN, run `kweaver-admin auth login`, or export KWEAVER_TOKEN",
    );
  }
}

export function registerSmallModelCommands(program: Command): void {
  const sm = program.command("small-model").description("Small model management (embedding / reranker)");

  sm
    .command("list")
    .option("--page <n>", "Page number", "1")
    .option("--size <n>", "Page size", "20")
    .option("--type <t>", "Filter by type (embedding|reranker)")
    .option("--name <n>", "Filter by name")
    .description("List small models")
    .action(async (opts: {
      page: string;
      size: string;
      type?: string;
      name?: string;
    }) => {
      const json = program.opts<{ json?: boolean }>().json === true;
      const c = client(program);
      requireToken(c);
      try {
        const data = await c.smallModelList({
          page: Number(opts.page),
          size: Number(opts.size),
          model_type: opts.type,
          model_name: opts.name,
        });
        if (json) { printJson(data); return; }
        const res = data as { data?: SmallModel[]; total?: number };
        const items = res.data ?? [];
        printColumns(
          ["NAME", "TYPE", "MODEL", "UPDATED"],
          items.map((m) => [
            m.model_name,
            m.model_type,
            m.model_config?.api_model ?? "-",
            m.update_time ?? "-",
          ]),
        );
      } catch (e) {
        exitUserError(e instanceof Error ? e.message : String(e));
      }
    });

  sm
    .command("get")
    .argument("<modelId>", "Model ID")
    .description("Get small model details")
    .action(async (modelId: string) => {
      const json = program.opts<{ json?: boolean }>().json === true;
      const c = client(program);
      requireToken(c);
      try {
        const data = await c.smallModelGet(modelId);
        if (json) { printJson(data); return; }
        printJson(data);
      } catch (e) {
        exitUserError(e instanceof Error ? e.message : String(e));
      }
    });

  sm
    .command("add")
    .requiredOption("--name <n>", "Model name")
    .requiredOption("--type <t>", "Type (embedding|reranker)")
    .requiredOption("--api-url <url>", "API URL")
    .requiredOption("--api-model <m>", "API model identifier")
    .option("--api-key <key>", "API key")
    .option("--batch-size <n>", "Batch size", "2048")
    .option("--max-tokens <n>", "Max tokens", "512")
    .option("--embedding-dim <n>", "Embedding dimension", "768")
    .description("Add a new small model")
    .action(async (opts: {
      name: string;
      type: string;
      apiUrl: string;
      apiModel: string;
      apiKey?: string;
      batchSize: string;
      maxTokens: string;
      embeddingDim: string;
    }) => {
      const json = program.opts<{ json?: boolean }>().json === true;
      const c = client(program);
      requireToken(c);
      try {
        const data = await c.smallModelAdd({
          model_name: opts.name,
          model_type: opts.type,
          model_config: {
            api_url: opts.apiUrl,
            api_model: opts.apiModel,
            api_key: opts.apiKey,
          },
          batch_size: Number(opts.batchSize),
          max_tokens: Number(opts.maxTokens),
          embedding_dim: Number(opts.embeddingDim),
        });
        if (json) { printJson(data); return; }
        console.log(chalk.green(`Added small model: ${opts.name}`));
      } catch (e) {
        exitUserError(e instanceof Error ? e.message : String(e));
      }
    });

  sm
    .command("edit")
    .argument("<modelId>", "Model ID")
    .option("--name <n>", "New name")
    .option("--api-url <url>", "API URL")
    .option("--api-model <m>", "API model")
    .description("Edit a small model")
    .action(async (modelId: string, opts: {
      name?: string;
      apiUrl?: string;
      apiModel?: string;
    }) => {
      const json = program.opts<{ json?: boolean }>().json === true;
      const c = client(program);
      requireToken(c);
      try {
        const data = await c.smallModelEdit({
          model_id: modelId,
          model_name: opts.name,
          model_config: (opts.apiUrl || opts.apiModel)
            ? { api_url: opts.apiUrl, api_model: opts.apiModel }
            : undefined,
        });
        if (json) { printJson(data); return; }
        console.log(chalk.green(`Updated small model ${modelId}`));
      } catch (e) {
        exitUserError(e instanceof Error ? e.message : String(e));
      }
    });

  sm
    .command("delete")
    .argument("<modelId...>", "Model ID(s) to delete")
    .description("Delete small model(s)")
    .action(async (modelIds: string[]) => {
      const json = program.opts<{ json?: boolean }>().json === true;
      const c = client(program);
      requireToken(c);
      try {
        const data = await c.smallModelDelete(modelIds);
        if (json) { printJson(data); return; }
        console.log(chalk.green(`Deleted ${modelIds.length} model(s)`));
      } catch (e) {
        exitUserError(e instanceof Error ? e.message : String(e));
      }
    });

  sm
    .command("test")
    .argument("<modelId>", "Model ID to test")
    .description("Test a small model (embedding sends vectorisation, reranker sends re-ranking)")
    .action(async (modelId: string) => {
      const json = program.opts<{ json?: boolean }>().json === true;
      const c = client(program);
      requireToken(c);
      try {
        const data = await c.smallModelTest({ model_id: modelId });
        if (json) { printJson(data); return; }
        const result = data as {
          res?: string;
          model_name?: string;
          model_type?: string;
          embedding_dim?: number;
          [k: string]: unknown;
        };
        console.log(`Model:   ${result.model_name ?? modelId} (${result.model_type ?? "unknown"})`);
        console.log(`Status:  ${result.res === "success" ? chalk.green("OK") : chalk.red("FAIL")}`);
        if (result.embedding_dim != null) {
          console.log(`Dim:     ${result.embedding_dim}`);
        }
      } catch (e) {
        exitUserError(e instanceof Error ? e.message : String(e));
      }
    });
}
```

- [ ] **Step 2: Register in `src/index.ts`**

```typescript
import { registerSmallModelCommands } from "./commands/small-model";
// After registerLlmCommands:
registerSmallModelCommands(program);
```

- [ ] **Step 3: Run typecheck + build + smoke**

```bash
npm run typecheck && npm run build && node dist/index.js small-model --help
```

Expected: shows `list`, `get`, `add`, `edit`, `delete`, `test`.

- [ ] **Step 4: Commit**

```bash
git add src/commands/small-model.ts src/index.ts
git commit -m "feat: small-model CRUD + test commands"
```

---

## Phase 7: Cleanup + Wiring

### Task 16: Remove old model command, update index.ts, update all printTable calls

**Files:**
- Delete: `src/commands/model.ts`
- Modify: `src/index.ts`
- Modify: `src/commands/audit.ts`

- [ ] **Step 1: Remove model.ts**

Delete `src/commands/model.ts`.

- [ ] **Step 2: Update `src/index.ts`**

Remove:

```typescript
import { registerModelCommands } from "./commands/model";
registerModelCommands(program);
```

Final `src/index.ts` imports should be:

```typescript
import { registerAuthCommands } from "./commands/auth";
import { registerOrgCommands } from "./commands/org";
import { registerUserCommands } from "./commands/user";
import { registerRoleCommands } from "./commands/role";
import { registerLlmCommands } from "./commands/llm";
import { registerSmallModelCommands } from "./commands/small-model";
import { registerAuditCommands } from "./commands/audit";
import { registerConfigCommands } from "./commands/config";
```

Register order: auth → org → user → role → llm → small-model → audit → config.

- [ ] **Step 3: Update `audit.ts` to use `printColumns` instead of `printTable`**

Replace `printTable` import with `printColumns` in `src/commands/audit.ts`. The only printTable call becomes:

```typescript
printColumns(["Field", "Value"], [
  ["baseUrl", c.getBaseUrl()],
  ["note", stub.message],
]);
```

- [ ] **Step 4: Remove `cli-table3` dependency if no longer used**

Check no remaining `printTable` or `cli-table3` imports:

```bash
npm run typecheck
```

If clean, remove the dependency:

```bash
npm uninstall cli-table3
npm uninstall @types/cli-table3 2>/dev/null || true
```

- [ ] **Step 5: Full verification**

```bash
npm run typecheck && npm test && npm run build
node dist/index.js --help
node dist/index.js auth --help
node dist/index.js org --help
node dist/index.js user --help
node dist/index.js role --help
node dist/index.js llm --help
node dist/index.js small-model --help
node dist/index.js audit --help
node dist/index.js config --help
```

Expected: all commands show help; typecheck and tests pass.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: remove old model command, clean up output, final wiring"
```

---

## Phase 8: Update Docs

### Task 17: Update ARCHITECTURE.md and product specs

**Files:**
- Modify: `ARCHITECTURE.md`
- Modify: `docs/product-specs/model-management.md`

- [ ] **Step 1: Update ARCHITECTURE.md command tree**

Replace the command tree section with:

```
kweaver-admin
  auth login|logout|status|token
  org list|tree|get|create|update|delete|members
  user list|get|create|update|delete
  user roles <userId>
  user assign-role <userId> <roleId>
  user revoke-role <userId> <roleId>
  role list
  llm list|get|add|edit|delete|test
  small-model list|get|add|edit|delete|test
  audit list
  config show|set
```

Update the architecture diagram to include `mf-model-manager` service and show `~/.kweaver-admin/` instead of `~/.kweaver/`.

- [ ] **Step 2: Update model-management.md**

Update to reflect the two-API-set architecture (LLM + small-model), referencing the design spec.

- [ ] **Step 3: Commit**

```bash
git add ARCHITECTURE.md docs/product-specs/model-management.md
git commit -m "docs: update architecture and model management specs"
```

---

## Verification Checklist

After all tasks:

```bash
npm run typecheck     # No TypeScript errors
npm test              # All unit tests pass
npm run build         # Builds successfully
node dist/index.js --help           # Shows all command groups
node dist/index.js auth status      # Shows auth state
node dist/index.js llm list --json  # JSON output works
```
