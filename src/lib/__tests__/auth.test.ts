import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from "vitest";
import { describeAuthState, resolveBaseUrl, resolveTokenFrom } from "../auth";
import * as platformStore from "../platforms";
import type { AdminState, TokenConfig } from "../types";

const { writeState, writeToken } = platformStore;

describe("resolveTokenFrom", () => {
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

  it("prefers KWEAVER_ADMIN_TOKEN env", () => {
    process.env.KWEAVER_ADMIN_TOKEN = "admin-tok";
    expect(resolveTokenFrom(tempDir)).toBe("admin-tok");
  });

  it("falls back to KWEAVER_TOKEN", () => {
    process.env.KWEAVER_TOKEN = "user-tok";
    expect(resolveTokenFrom(tempDir)).toBe("user-tok");
  });

  it("reads from platform storage when no env", () => {
    writeState(tempDir, { currentPlatform: "https://test.com" });
    writeToken(tempDir, "https://test.com", { accessToken: "file-tok" });
    expect(resolveTokenFrom(tempDir)).toBe("file-tok");
  });

  it("returns undefined when nothing configured", () => {
    expect(resolveTokenFrom(tempDir)).toBeUndefined();
  });
});

describe("resolveBaseUrl", () => {
  const originalEnv = { ...process.env };
  let readStateSpy: MockInstance<(adminDir: string) => AdminState | undefined>;

  beforeEach(() => {
    readStateSpy = vi.spyOn(platformStore, "readState");
    delete process.env.KWEAVER_BASE_URL;
    delete process.env.KWEAVER_API_URL;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    readStateSpy.mockRestore();
  });

  it("prefers KWEAVER_BASE_URL over session and inline config", () => {
    process.env.KWEAVER_BASE_URL = "https://from-env.com/";
    readStateSpy.mockReturnValue({ currentPlatform: "https://session.com" });
    expect(resolveBaseUrl({ baseUrl: "https://config.com" })).toBe("https://from-env.com");
  });

  it("prefers KWEAVER_API_URL when KWEAVER_BASE_URL is unset", () => {
    process.env.KWEAVER_API_URL = "https://api-url.com/";
    readStateSpy.mockReturnValue({ currentPlatform: "https://session.com" });
    expect(resolveBaseUrl({ baseUrl: "https://config.com" })).toBe("https://api-url.com");
  });

  it("uses currentPlatform when no env and session exists (wins over config file override arg)", () => {
    readStateSpy.mockReturnValue({ currentPlatform: "https://session.com/" });
    expect(resolveBaseUrl({ baseUrl: "https://config.com" })).toBe("https://session.com");
  });

  it("uses passed config when no env and no session", () => {
    readStateSpy.mockReturnValue(undefined);
    expect(resolveBaseUrl({ baseUrl: "https://config-only.com/" })).toBe("https://config-only.com");
  });

  it("falls back to default base URL when no env, no session, and empty config object", () => {
    readStateSpy.mockReturnValue(undefined);
    expect(resolveBaseUrl({})).toBe("http://localhost:8080");
  });
});

describe("describeAuthState", () => {
  const originalEnv = { ...process.env };
  let readStateSpy: MockInstance<(adminDir: string) => AdminState | undefined>;
  let readTokenSpy: MockInstance<
    (adminDir: string, url: string) => TokenConfig | undefined
  >;

  beforeEach(() => {
    readStateSpy = vi.spyOn(platformStore, "readState");
    readTokenSpy = vi.spyOn(platformStore, "readToken");
    delete process.env.KWEAVER_ADMIN_TOKEN;
    delete process.env.KWEAVER_TOKEN;
    delete process.env.KWEAVER_BASE_URL;
    delete process.env.KWEAVER_API_URL;
    delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    delete process.env.KWEAVER_TLS_INSECURE;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    readStateSpy.mockRestore();
    readTokenSpy.mockRestore();
  });

  it("reports env-admin and hasToken when KWEAVER_ADMIN_TOKEN is set", () => {
    process.env.KWEAVER_ADMIN_TOKEN = "t";
    readStateSpy.mockReturnValue({ currentPlatform: "https://p.com" });
    const s = describeAuthState();
    expect(s.tokenSource).toBe("env-admin");
    expect(s.hasToken).toBe(true);
  });

  it("reports env when only KWEAVER_TOKEN is set", () => {
    process.env.KWEAVER_TOKEN = "t";
    readStateSpy.mockReturnValue({ currentPlatform: "https://p.com" });
    const s = describeAuthState();
    expect(s.tokenSource).toBe("env");
    expect(s.hasToken).toBe(true);
  });

  it("prefers env-admin over KWEAVER_TOKEN when both are set", () => {
    process.env.KWEAVER_ADMIN_TOKEN = "a";
    process.env.KWEAVER_TOKEN = "b";
    readStateSpy.mockReturnValue(undefined);
    const s = describeAuthState();
    expect(s.tokenSource).toBe("env-admin");
    expect(s.hasToken).toBe(true);
  });

  it("reports file when token is loaded from disk for current platform", () => {
    readStateSpy.mockReturnValue({ currentPlatform: "https://p.com" });
    readTokenSpy.mockReturnValue({ accessToken: "at" });
    const s = describeAuthState();
    expect(s.tokenSource).toBe("file");
    expect(s.hasToken).toBe(true);
    expect(s.currentPlatform).toBe("https://p.com");
  });

  it("reports none when state has platform but no access token in file", () => {
    readStateSpy.mockReturnValue({ currentPlatform: "https://p.com" });
    readTokenSpy.mockReturnValue({ accessToken: "", refreshToken: "rt" });
    const s = describeAuthState();
    expect(s.tokenSource).toBe("none");
    expect(s.hasToken).toBe(false);
  });

  it("reports none when there is no session and no env token", () => {
    readStateSpy.mockReturnValue(undefined);
    const s = describeAuthState();
    expect(s.tokenSource).toBe("none");
    expect(s.hasToken).toBe(false);
  });

  it("marks expired and refreshable from saved file token", () => {
    readStateSpy.mockReturnValue({ currentPlatform: "https://p.com" });
    const past = Date.now() - 60_000;
    readTokenSpy.mockReturnValue({
      accessToken: "at",
      refreshToken: "rt",
      expiresAt: past,
    });
    const s = describeAuthState();
    expect(s.expired).toBe(true);
    expect(s.refreshable).toBe(true);
  });
});
