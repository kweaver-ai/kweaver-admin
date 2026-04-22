import { describe, expect, it } from "vitest";
import { describePlatformEntries } from "../auth";
import type { TokenConfig } from "../../lib/types";

function jwt(payload: Record<string, unknown>): string {
  const enc = (obj: unknown) =>
    Buffer.from(JSON.stringify(obj)).toString("base64url");
  return `${enc({ alg: "none" })}.${enc(payload)}.`;
}

describe("describePlatformEntries", () => {
  const NOW = 1_700_000_000_000;

  it("returns [] when no platforms are passed", () => {
    expect(
      describePlatformEntries({ platforms: [], readToken: () => undefined }),
    ).toEqual([]);
  });

  it("skips platforms whose token cannot be read", () => {
    const tokens: Record<string, TokenConfig | undefined> = {
      "https://a.example.com": undefined,
      "https://b.example.com": { accessToken: "x" },
    };
    const out = describePlatformEntries({
      platforms: ["https://a.example.com", "https://b.example.com"],
      readToken: (url) => tokens[url],
    });
    expect(out.map((e) => e.platform)).toEqual(["https://b.example.com"]);
  });

  it("decodes username/userId from id_token claims", () => {
    const idToken = jwt({
      preferred_username: "alice",
      sub: "user-123",
      iss: "https://idp.example.com",
    });
    const out = describePlatformEntries({
      platforms: ["https://k.example.com"],
      readToken: () => ({
        accessToken: "x",
        idToken,
        expiresAt: NOW + 60_000,
      }),
      now: NOW,
    });
    expect(out[0]).toMatchObject({
      platform: "https://k.example.com",
      username: "alice",
      userId: "user-123",
      issuer: "https://idp.example.com",
      status: "valid",
      refreshable: false,
      tlsInsecure: false,
    });
  });

  it("falls back from preferred_username to name", () => {
    const idToken = jwt({ name: "Bob", sub: "u2" });
    const [entry] = describePlatformEntries({
      platforms: ["https://k.example.com"],
      readToken: () => ({ accessToken: "x", idToken, expiresAt: NOW + 1 }),
      now: NOW,
    });
    expect(entry.username).toBe("Bob");
  });

  it("flags expired tokens and reports refreshable when refresh_token saved", () => {
    const out = describePlatformEntries({
      platforms: ["https://exp.example.com", "https://exp2.example.com"],
      readToken: (url) =>
        url === "https://exp.example.com"
          ? { accessToken: "x", expiresAt: NOW - 1, refreshToken: "r" }
          : { accessToken: "x", expiresAt: NOW - 1 },
      now: NOW,
    });
    expect(out[0]).toMatchObject({ status: "expired", refreshable: true });
    expect(out[1]).toMatchObject({ status: "expired", refreshable: false });
  });

  it("uses 'no-expiry' when expiresAt is missing (e.g. opaque static token)", () => {
    const [entry] = describePlatformEntries({
      platforms: ["https://k.example.com"],
      readToken: () => ({ accessToken: "x" }),
      now: NOW,
    });
    expect(entry.status).toBe("no-expiry");
    expect(entry.refreshable).toBe(false);
    expect(entry.username).toBeUndefined();
  });

  it("marks the active platform via currentPlatform input", () => {
    const out = describePlatformEntries({
      platforms: ["https://a.example.com", "https://b.example.com"],
      currentPlatform: "https://b.example.com",
      readToken: () => ({ accessToken: "x" }),
      now: NOW,
    });
    expect(out.map((e) => [e.platform, e.active])).toEqual([
      ["https://a.example.com", false],
      ["https://b.example.com", true],
    ]);
  });

  it("propagates tlsInsecure flag from saved token", () => {
    const [entry] = describePlatformEntries({
      platforms: ["https://k.example.com"],
      readToken: () => ({ accessToken: "x", tlsInsecure: true }),
      now: NOW,
    });
    expect(entry.tlsInsecure).toBe(true);
  });
});
