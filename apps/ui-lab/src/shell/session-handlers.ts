import { http, HttpResponse } from "msw";
import type { LabRole } from "../screens/screen-types";

// The same accounts `pnpm db:seed-mockup` creates from docs/mockup/js/data.js, so the lab,
// the mockup and a seeded database all show one person per role.
const USERS: Record<Exclude<LabRole, "guest">, { id: string; name: string; email: string; role: string }> = {
  learner: { id: "usr-learner-001", name: "Nguyễn Minh Anh", email: "minhanh@codi.vn", role: "LEARNER" },
  lecturer: { id: "usr-lecturer-001", name: "Trần Quốc Huy", email: "quochuy@codi.vn", role: "LECTURER" },
  admin: { id: "usr-admin-001", name: "Phạm Gia Bảo", email: "giabao@codi.vn", role: "ADMIN" },
};

/** Session, role and header data every screen needs, answered for the chosen role. */
export function sessionHandlers(role: LabRole) {
  const user = role === "guest" ? null : USERS[role];
  const now = "2026-10-26T07:00:00.000Z";
  return [
    http.get("/api/auth/get-session", () =>
      HttpResponse.json(user ? {
        session: { id: "ses-lab", userId: user.id, token: "lab", expiresAt: "2027-01-01T00:00:00.000Z", createdAt: now, updatedAt: now },
        user: { id: user.id, name: user.name, email: user.email, emailVerified: true, image: null, createdAt: now, updatedAt: now },
      } : null)),
    http.get("/api/user/roles", () =>
      user ? HttpResponse.json({ roles: [user.role] }) : HttpResponse.json({ error: "Vui lòng đăng nhập." }, { status: 401 })),
    http.get("/api/notifications", () =>
      HttpResponse.json({
        userId: user?.id ?? "",
        unreadCount: 1,
        items: [
          { id: 1, title: "Bài tập đã được chấm", body: "Bài “Xây dựng REST API” đạt 8.5/10.", link: null, readAt: null, createdAt: now },
          { id: 2, title: "Chào mừng đến với Codi", body: null, link: null, readAt: now, createdAt: now },
        ],
      })),
    http.patch("/api/notifications", () => HttpResponse.json({ ok: true })),
    http.post("/api/notifications", () => HttpResponse.json({ ok: true })),
    // Header cart badge; a cart screen state overrides this with its own handler.
    http.get("/api/student/cart", () =>
      HttpResponse.json({ items: [], subtotal: 0, discount: 0, total: 0, voucher: null, removedOwnedTitles: [], pendingOrder: null })),
  ];
}

export const MOCKUP_USER_ID: Record<LabRole, string | null> = {
  guest: null,
  learner: USERS.learner.id,
  lecturer: USERS.lecturer.id,
  admin: USERS.admin.id,
};
