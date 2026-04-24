import { describe, expect, it, vi } from "vitest";
import { looksLikeUuid, resolveRoleId, resolveUserId } from "../resolve-refs";

const UUID = "00990824-4bf7-11f0-8fa7-865d5643e61f";

describe("looksLikeUuid", () => {
  it("matches RFC 4122-ish lowercase UUID", () => {
    expect(looksLikeUuid(UUID)).toBe(true);
  });
  it("matches uppercase UUID", () => {
    expect(looksLikeUuid(UUID.toUpperCase())).toBe(true);
  });
  it("rejects non-UUID names", () => {
    expect(looksLikeUuid("admin")).toBe(false);
    expect(looksLikeUuid("数据管理员")).toBe(false);
    expect(looksLikeUuid("")).toBe(false);
  });
});

describe("resolveUserId", () => {
  it("returns UUID input untouched without an API call", async () => {
    const findUserByAccount = vi.fn();
    const id = await resolveUserId({ findUserByAccount }, UUID);
    expect(id).toBe(UUID);
    expect(findUserByAccount).not.toHaveBeenCalled();
  });

  it("looks up account names via findUserByAccount", async () => {
    const findUserByAccount = vi
      .fn()
      .mockResolvedValue({ id: UUID, account: "admin" });
    const id = await resolveUserId({ findUserByAccount }, "admin");
    expect(id).toBe(UUID);
    expect(findUserByAccount).toHaveBeenCalledWith("admin");
  });

  it("throws a helpful error when the account is unknown", async () => {
    const findUserByAccount = vi.fn().mockResolvedValue(null);
    await expect(
      resolveUserId({ findUserByAccount }, "ghost"),
    ).rejects.toThrow(/User 'ghost' not found/);
  });
});

describe("resolveRoleId", () => {
  it("returns UUID input untouched without an API call", async () => {
    const listRoles = vi.fn();
    const id = await resolveRoleId({ listRoles }, UUID);
    expect(id).toBe(UUID);
    expect(listRoles).not.toHaveBeenCalled();
  });

  it("returns the unique exact-name match", async () => {
    const listRoles = vi.fn().mockResolvedValue({
      entries: [
        { id: UUID, name: "数据管理员" },
        { id: "1111-...", name: "数据管理员-备份" },
      ],
    });
    const id = await resolveRoleId({ listRoles }, "数据管理员");
    expect(id).toBe(UUID);
  });

  it("rejects when an exact match is ambiguous", async () => {
    const listRoles = vi.fn().mockResolvedValue({
      entries: [
        { id: "a", name: "Ops" },
        { id: "b", name: "Ops" },
      ],
    });
    await expect(
      resolveRoleId({ listRoles }, "Ops"),
    ).rejects.toThrow(/ambiguous/);
  });

  it("rejects when no entries match at all", async () => {
    const listRoles = vi.fn().mockResolvedValue({ entries: [] });
    await expect(
      resolveRoleId({ listRoles }, "missing-role"),
    ).rejects.toThrow(/not found/);
  });

  it("refuses to guess on substring-only matches", async () => {
    const listRoles = vi.fn().mockResolvedValue({
      entries: [
        { id: "a", name: "Ops Lead" },
        { id: "b", name: "Ops Backup" },
      ],
    });
    await expect(
      resolveRoleId({ listRoles }, "Ops"),
    ).rejects.toThrow(/No role exactly named 'Ops'/);
  });
});
