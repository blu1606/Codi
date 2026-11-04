// Safe to import in clients; database guards live in rbac.ts.
export const ROLE = { LEARNER: "LEARNER", LECTURER: "LECTURER", ADMIN: "ADMIN" } as const;
export type RoleId = (typeof ROLE)[keyof typeof ROLE];

export function getPrimaryRole(roles: readonly RoleId[]): RoleId | null {
  return [ROLE.ADMIN, ROLE.LECTURER, ROLE.LEARNER].find((role) => roles.includes(role)) ?? null;
}

export const ROLE_LABEL: Record<RoleId, string> = {
  LEARNER: "Học viên", LECTURER: "Giảng viên", ADMIN: "Quản trị viên",
};

export function getRoleHome(role: RoleId | null) {
  if (role === ROLE.ADMIN) return "/dashboard/admin";
  if (role === ROLE.LECTURER) return "/dashboard/lecturer";
  return role === ROLE.LEARNER ? "/dashboard" : "/";
}
