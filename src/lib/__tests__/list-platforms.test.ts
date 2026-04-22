import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { encodePlatformUrl, listPlatforms, writeToken } from "../platforms";

describe("listPlatforms", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "kwa-list-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns [] when ~/.kweaver-admin has no platforms folder", () => {
    expect(listPlatforms(tempDir)).toEqual([]);
  });

  it("returns [] when platforms folder is empty", () => {
    mkdirSync(join(tempDir, "platforms"), { recursive: true });
    expect(listPlatforms(tempDir)).toEqual([]);
  });

  it("lists platforms that have a saved token.json, sorted", () => {
    writeToken(tempDir, "https://b.example.com", { accessToken: "x" });
    writeToken(tempDir, "https://a.example.com", { accessToken: "y" });
    expect(listPlatforms(tempDir)).toEqual([
      "https://a.example.com",
      "https://b.example.com",
    ]);
  });

  it("skips folders whose name is not a valid base64url URL", () => {
    writeToken(tempDir, "https://ok.example.com", { accessToken: "x" });
    mkdirSync(join(tempDir, "platforms", "not-base64-url-name!"), { recursive: true });
    writeFileSync(
      join(tempDir, "platforms", "not-base64-url-name!", "token.json"),
      "{}",
    );
    expect(listPlatforms(tempDir)).toEqual(["https://ok.example.com"]);
  });

  it("skips folders without a token.json (e.g. only client.json)", () => {
    const url = "https://stale.example.com";
    const dir = join(tempDir, "platforms", encodePlatformUrl(url));
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "client.json"), "{}");
    writeToken(tempDir, "https://live.example.com", { accessToken: "x" });
    expect(listPlatforms(tempDir)).toEqual(["https://live.example.com"]);
  });

  it("skips entries that decode to a non-http(s) string", () => {
    const dir = join(tempDir, "platforms", Buffer.from("ftp://x").toString("base64url"));
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "token.json"), "{}");
    expect(listPlatforms(tempDir)).toEqual([]);
  });
});
