import { describe, expect, it } from "vitest";
import { resolveBaseUrlFromProcessArgv } from "../resolve-cli-base-url";

describe("resolveBaseUrlFromProcessArgv", () => {
  it("reads --base-url from argv", () => {
    expect(
      resolveBaseUrlFromProcessArgv([
        "node",
        "cli.js",
        "--base-url",
        "https://example.com/",
        "call",
        "/x",
      ]),
    ).toBe("https://example.com");
  });

  it("returns undefined when absent", () => {
    expect(resolveBaseUrlFromProcessArgv(["node", "cli.js", "org", "list"])).toBeUndefined();
  });
});
