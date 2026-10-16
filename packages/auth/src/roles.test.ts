import { describe, expect, it } from "vitest";
import { getPrimaryRole, getRoleHome, ROLE } from "./roles";

describe("role-aware navigation", () => {
  it("gives a guest no authenticated workspace", () => {
    expect(getPrimaryRole([])).toBeNull();
    expect(getRoleHome(null)).toBe("/");
  });
  it.each([
    [ROLE.LEARNER, "/dashboard"], [ROLE.LECTURER, "/dashboard/lecturer"], [ROLE.ADMIN, "/dashboard/admin"],
  ] as const)("routes %s to its server-protected workspace", (role, home) => {
    expect(getPrimaryRole([role])).toBe(role);
    expect(getRoleHome(role)).toBe(home);
  });
  it("uses the same admin > lecturer > learner priority as the dashboard", () => {
    expect(getPrimaryRole([ROLE.LEARNER, ROLE.ADMIN, ROLE.LECTURER])).toBe(ROLE.ADMIN);
    expect(getPrimaryRole([ROLE.LEARNER, ROLE.LECTURER])).toBe(ROLE.LECTURER);
  });
});
