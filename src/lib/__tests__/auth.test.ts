import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveTokenFrom } from "../auth";
import { writeState, writeToken } from "../platforms";

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
