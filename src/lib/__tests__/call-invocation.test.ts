import { describe, expect, it } from "vitest";
import { parseCallArgs } from "../call-invocation";

describe("parseCallArgs", () => {
  it("parses method, url, header, and body", () => {
    const inv = parseCallArgs(
      ["/api/x", "-X", "POST", "-H", "X-Test: 1", "-d", '{"a":1}'],
      "bd_public",
    );
    expect(inv.url).toBe("/api/x");
    expect(inv.method).toBe("POST");
    expect(inv.headers.get("X-Test")).toBe("1");
    expect(inv.body).toBe('{"a":1}');
    expect(inv.businessDomain).toBe("bd_public");
  });

  it("applies -bd", () => {
    const inv = parseCallArgs(["/a", "-bd", "tenant-1"], "bd_public");
    expect(inv.businessDomain).toBe("tenant-1");
  });

  it("accepts --json as pretty output flag", () => {
    const inv = parseCallArgs(["--json", "/api/x"], "bd_public");
    expect(inv.url).toBe("/api/x");
    expect(inv.pretty).toBe(true);
  });
});
