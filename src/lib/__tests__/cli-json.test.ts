import { describe, expect, it } from "vitest";
import { Command } from "commander";
import { wantsJsonFromArgv, wantsJsonOutput } from "../cli-json";

describe("wantsJsonFromArgv", () => {
  it("is true when argv includes --json", () => {
    expect(wantsJsonFromArgv(["node", "cli.js", "--json", "call", "/x"])).toBe(true);
  });

  it("is false when --json is absent", () => {
    expect(wantsJsonFromArgv(["node", "cli.js", "call", "/x"])).toBe(false);
  });
});

describe("wantsJsonOutput", () => {
  it("is true when global --json precedes a nested subcommand", () => {
    let json: boolean | undefined;
    const program = new Command();
    program.option("--json", "Output JSON");
    program
      .command("user")
      .command("list")
      .action(() => {
        json = wantsJsonOutput(program);
      });
    program.parse(["--json", "user", "list"], { from: "user" });
    expect(json).toBe(true);
  });

  it("is false when --json is not set", () => {
    let json: boolean | undefined;
    const program = new Command();
    program.option("--json", "Output JSON");
    program.command("ping").action(() => {
      json = wantsJsonOutput(program);
    });
    program.parse(["ping"], { from: "user" });
    expect(json).toBe(false);
  });

  it("is not satisfied by program.opts() alone on the subcommand (documents Commander pitfall)", () => {
    let wrong: boolean | undefined;
    let right: boolean | undefined;
    const program = new Command();
    program.option("--json", "Output JSON");
    program.command("ping").action(function cmdAction(this: Command) {
      wrong = this.opts<{ json?: boolean }>().json === true;
      right = wantsJsonOutput(program);
    });
    program.parse(["--json", "ping"], { from: "user" });
    expect(wrong).toBe(false);
    expect(right).toBe(true);
  });
});
