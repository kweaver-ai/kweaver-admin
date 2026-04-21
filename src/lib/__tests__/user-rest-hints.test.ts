import { describe, expect, it } from "vitest";
import { appendUserRest404Hint } from "../user-rest-hints";

describe("appendUserRest404Hint", () => {
  it("appends hint for 404", () => {
    const out = appendUserRest404Hint("HTTP 404: 404 page not found");
    expect(out).toContain("Hint:");
    expect(out).toContain("/api/user-management/v1/users");
  });

  it("leaves other errors unchanged", () => {
    expect(appendUserRest404Hint("HTTP 403: forbidden")).toBe("HTTP 403: forbidden");
  });
});
