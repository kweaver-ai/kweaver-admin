import { afterEach, describe, expect, it } from "vitest";
import { resolveDefaultUserManagementRole } from "../user-management-role";

describe("resolveDefaultUserManagementRole", () => {
  afterEach(() => {
    delete process.env.KWEAVER_UM_ROLE;
  });

  it("defaults to super_admin", () => {
    expect(resolveDefaultUserManagementRole()).toBe("super_admin");
  });

  it("reads KWEAVER_UM_ROLE", () => {
    process.env.KWEAVER_UM_ROLE = "normal_user";
    expect(resolveDefaultUserManagementRole()).toBe("normal_user");
  });
});
