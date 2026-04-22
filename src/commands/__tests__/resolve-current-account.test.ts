import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resolveCurrentAccount } from "../auth";
import { writeState, writeToken } from "../../lib/platforms";

function makeIdToken(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${header}.${body}.`;
}

describe("resolveCurrentAccount", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "kwa-acct-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns undefined when no current platform", () => {
    expect(resolveCurrentAccount(tempDir)).toBeUndefined();
  });

  it("returns undefined when no token saved", () => {
    writeState(tempDir, { currentPlatform: "https://p.com" });
    expect(resolveCurrentAccount(tempDir)).toBeUndefined();
  });

  it("returns undefined when token has no id_token", () => {
    writeState(tempDir, { currentPlatform: "https://p.com" });
    writeToken(tempDir, "https://p.com", { accessToken: "at" });
    expect(resolveCurrentAccount(tempDir)).toBeUndefined();
  });

  it("falls back to access_token claim when id_token lacks username", () => {
    writeState(tempDir, { currentPlatform: "https://p.com" });
    writeToken(tempDir, "https://p.com", {
      accessToken: makeIdToken({ preferred_username: "from-access" }),
      idToken: makeIdToken({ sub: "uid-only" }),
    });
    expect(resolveCurrentAccount(tempDir)).toBe("from-access");
  });

  it("falls back to persisted username when no JWT carries the claim", () => {
    writeState(tempDir, { currentPlatform: "https://p.com" });
    writeToken(tempDir, "https://p.com", {
      accessToken: makeIdToken({ sub: "uid-only" }),
      idToken: makeIdToken({ sub: "uid-only" }),
      username: "alice",
    });
    expect(resolveCurrentAccount(tempDir)).toBe("alice");
  });

  it("reads preferred_username from id_token", () => {
    writeState(tempDir, { currentPlatform: "https://p.com" });
    writeToken(tempDir, "https://p.com", {
      accessToken: "at",
      idToken: makeIdToken({ preferred_username: "admin", name: "Admin User", sub: "uid-1" }),
    });
    expect(resolveCurrentAccount(tempDir)).toBe("admin");
  });

  it("falls back to name when preferred_username missing", () => {
    writeState(tempDir, { currentPlatform: "https://p.com" });
    writeToken(tempDir, "https://p.com", {
      accessToken: "at",
      idToken: makeIdToken({ name: "fallback-name" }),
    });
    expect(resolveCurrentAccount(tempDir)).toBe("fallback-name");
  });

  it("returns undefined when both claims are missing or empty", () => {
    writeState(tempDir, { currentPlatform: "https://p.com" });
    writeToken(tempDir, "https://p.com", {
      accessToken: "at",
      idToken: makeIdToken({ preferred_username: "  ", sub: "uid" }),
    });
    expect(resolveCurrentAccount(tempDir)).toBeUndefined();
  });

  it("returns undefined when id_token is malformed", () => {
    writeState(tempDir, { currentPlatform: "https://p.com" });
    writeToken(tempDir, "https://p.com", {
      accessToken: "at",
      idToken: "not-a-jwt",
    });
    expect(resolveCurrentAccount(tempDir)).toBeUndefined();
  });
});
