import { ROLE, type RoleId } from "@codi-1/auth/roles";

/** Signed-in account shared by S04b settings and profile. */
export const accountUser = {
  id: "usr-learner-001",
  name: "Nguyễn Minh Anh",
  email: "minhanh@codi.vn",
  emailVerified: true,
  image: null,
  createdAt: new Date("2026-03-02T03:00:00.000Z"),
  updatedAt: new Date("2026-10-01T03:00:00.000Z"),
};

/** Roles returned for the account (profile card). */
export const accountRoles: RoleId[] = [ROLE.LEARNER];

/** Active sessions for the settings page; the first one is the current device. */
export const accountSessions = [
  { id: "ses-lab", token: "lab", userId: "usr-learner-001", expiresAt: new Date("2027-01-01T00:00:00.000Z"), createdAt: new Date("2026-10-26T07:00:00.000Z"), updatedAt: new Date("2026-10-26T07:00:00.000Z"), ipAddress: "203.0.113.10", userAgent: "Chrome on Windows" },
];
