import { ROLE } from "@codi-1/auth/roles";
import type { AdminUserRow } from "@/app/dashboard/admin/users/users-client";
import type { UserImpactCounts } from "@/app/dashboard/admin/actions";

export const ADMIN_USER_ID = "usr-admin-001";

/** Users list for S31 (mixed roles, one banned account). */
export const adminUsers: AdminUserRow[] = [
  { id: ADMIN_USER_ID, name: "Lê Quản Trị", email: "admin@codi.vn", createdAt: "2026-01-10T03:00:00.000Z", banned: false, roleId: ROLE.ADMIN },
  { id: "usr-lecturer-001", name: "Trần Minh Khoa", email: "khoa.lecturer@codi.vn", createdAt: "2026-02-14T03:00:00.000Z", banned: false, roleId: ROLE.LECTURER },
  { id: "usr-learner-001", name: "Nguyễn Minh An", email: "an.learner@codi.vn", createdAt: "2026-03-02T03:00:00.000Z", banned: false, roleId: ROLE.LEARNER },
  { id: "usr-learner-002", name: "Phạm Quốc Bảo", email: "bao.p@codi.vn", createdAt: "2026-05-20T03:00:00.000Z", banned: true, banReason: "Spam bình luận", roleId: ROLE.LEARNER },
];

/** Impact counts shown in the deactivate dialog for a learner who owns courses. */
export const deactivateImpact: UserImpactCounts = { ownedCourses: 2, pendingOrders: 1, taughtCourses: 0 };
