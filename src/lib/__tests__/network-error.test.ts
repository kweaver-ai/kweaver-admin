import { describe, expect, it } from "vitest";
import { formatFetchFailure } from "../network-error";

describe("formatFetchFailure", () => {
  it("includes url and cause chain", () => {
    const inner = Object.assign(new Error("connect ECONNREFUSED"), {
      code: "ECONNREFUSED",
    });
    const err = new Error("fetch failed", { cause: inner });
    const msg = formatFetchFailure("https://example.com/api/x", err);
    expect(msg).toContain("fetch failed");
    expect(msg).toContain("ECONNREFUSED");
    expect(msg).toContain("https://example.com/api/x");
  });
});
