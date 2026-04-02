import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  deleteToken,
  encodePlatformUrl,
  readState,
  readToken,
  writeState,
  writeToken,
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
