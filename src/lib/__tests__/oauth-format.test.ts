import { afterEach, describe, expect, it } from "vitest";
import { formatHttpError } from "../oauth";

describe("formatHttpError (kweaver-sdk parity)", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("formats fetch failed + cause + TLS hint when verification is on", () => {
    const err = new TypeError("fetch failed");
    err.cause = new Error("unable to verify the first certificate");
    expect(formatHttpError(err)).toBe(
      "fetch failed: unable to verify the first certificate\n" +
        "Hint: use --insecure (-k) to skip TLS verification for self-signed certificates.",
    );
  });

  it("uses alternate hint when TLS verification is disabled", () => {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    const err = new TypeError("fetch failed");
    err.cause = new Error("ECONNRESET");
    expect(formatHttpError(err)).toBe(
      "fetch failed: ECONNRESET\n" +
        "Hint: TLS verification is already disabled for this process. Check network reachability, TLS termination, or proxy stability.",
    );
  });

  it("returns plain message for other errors", () => {
    expect(formatHttpError(new Error("OAuth state mismatch"))).toBe("OAuth state mismatch");
  });
});
