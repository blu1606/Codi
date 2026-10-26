import type { AdminDashboardData } from "@/app/dashboard/admin/actions";

/** Admin home with KPIs, todo counts and recent orders (S30 default). */
export const adminDashboardData: AdminDashboardData = {
  kpis: { revenue30d: 48750000, paidOrders30d: 37, allOrders30d: 52, newLearners30d: 64, publishedCourses: 9 },
  todo: { pendingCoursesCount: 2, overdueOrdersCount: 3, expiringVouchersCount: 1, inactiveUsersCount: 4 },
  recentOrders: [
    { id: 52, code: "CODI20261026-0052", buyerName: "Nguyễn Minh An", buyerEmail: "an.learner@codi.vn", totalAmount: 1290000, status: "paid", createdAt: new Date("2026-10-26T06:30:00+07:00"), isOverdue: false },
    { id: 51, code: "CODI20261025-0051", buyerName: "Phạm Quốc Bảo", buyerEmail: "bao.p@codi.vn", totalAmount: 990000, status: "pending", createdAt: new Date("2026-10-24T09:10:00+07:00"), isOverdue: true },
    { id: 50, code: "CODI20261025-0050", buyerName: "Lê Hoài Nam", buyerEmail: "nam.le@codi.vn", totalAmount: 2280000, status: "cancelled", createdAt: new Date("2026-10-25T14:00:00+07:00"), isOverdue: false },
  ],
};

/** Empty system: zero counts and no recent orders (S30 empty state). */
export const adminDashboardEmpty: AdminDashboardData = {
  kpis: { revenue30d: 0, paidOrders30d: 0, allOrders30d: 0, newLearners30d: 0, publishedCourses: 0 },
  todo: { pendingCoursesCount: 0, overdueOrdersCount: 0, expiringVouchersCount: 0, inactiveUsersCount: 0 },
  recentOrders: [],
};
