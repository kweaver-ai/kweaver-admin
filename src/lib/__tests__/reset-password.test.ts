import { describe, expect, it } from "vitest";
import { classifyUserRef } from "../../commands/user";

const UUID = "12345678-1234-1234-1234-123456789abc";

describe("classifyUserRef", () => {
  it("classifies UUID-shaped input as id", () => {
    expect(classifyUserRef(UUID)).toEqual({ kind: "id", id: UUID });
  });

  it("classifies non-UUID input as account", () => {
    expect(classifyUserRef("testcli1")).toEqual({ kind: "account", account: "testcli1" });
  });

  it("forceId bypasses UUID regex (non-standard ids accepted)", () => {
    expect(classifyUserRef("weird-id", { forceId: true })).toEqual({
      kind: "id",
      id: "weird-id",
    });
  });

  it("forceId never falls through to account classification", () => {
    expect(classifyUserRef("testcli1", { forceId: true })).toEqual({
      kind: "id",
      id: "testcli1",
    });
  });
});
