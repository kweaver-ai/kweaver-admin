import { describe, expect, it } from "vitest";
import { indexOfCallSubcommand } from "../call-route";

describe("indexOfCallSubcommand", () => {
  it("returns index of call when it is argv[2]", () => {
    expect(indexOfCallSubcommand(["node", "cli.js", "call", "/api/x"])).toBe(2);
  });

  it("returns index of call after global flags", () => {
    expect(
      indexOfCallSubcommand(["node", "cli.js", "--json", "--base-url", "https://h/", "call", "/api/x"]),
    ).toBe(5);
  });

  it("returns index of curl", () => {
    expect(indexOfCallSubcommand(["node", "cli.js", "curl", "/y"])).toBe(2);
  });

  it("returns -1 when call is absent", () => {
    expect(indexOfCallSubcommand(["node", "cli.js", "user", "list"])).toBe(-1);
  });
});
