import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PgDialect } from "drizzle-orm/pg-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nearLimitVoucherPredicate } from "@/lib/admin-vouchers-service";

const state = vi.hoisted(() => ({
  session: { user: { id: "admin" } } as { user: { id: string } } | null,
  roles: ["ADMIN"],
  where: vi.fn(),
  select: vi.fn(),
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`redirect:${url}`); } }));
vi.mock("next/link", () => ({ default: ({ href, children, ...props }: any) => createElement("a", { href, ...props }, children) }));
vi.mock("@codi-1/auth", () => ({ ROLE: { ADMIN: "ADMIN", LEARNER: "LEARNER" }, getActiveRoles: async () => state.roles }));
vi.mock("@/services", () => ({
  auth: { api: { getSession: async () => state.session } },
  db: { select: (...args: any[]) => state.select(...args) },
}));
vi.mock("./actions", () => ({ getAdminDashboardData: async () => ({
  kpis: { revenue30d: 120000, paidOrders30d: 1, allOrders30d: 4, newLearners30d: 2, publishedCourses: 3 },
  todo: { pendingCoursesCount: 7, overdueOrdersCount: 2, expiringVouchersCount: 3, inactiveUsersCount: 1 },
  recentOrders: [],
}) }));
vi.mock("./vouchers/vouchers-table-client", () => ({ VouchersTableClient: ({ vouchers }: any) => createElement("p", null, `${vouchers.length} voucher rows`) }));
import AdminDashboardPage from "./page";
import AdminVouchersPage from "./vouchers/page";

describe("admin dashboard destination contracts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.session = { user: { id: "admin" } };
    state.roles = ["ADMIN"];
    state.where.mockReturnValue({ orderBy: async () => [] });
    state.select.mockReturnValue({ from: () => ({ where: state.where }) });
  });
  afterEach(() => vi.useRealTimers());

  it("links available queues with exact filters and marks unavailable destinations without dead anchors", async () => {
    const html = renderToStaticMarkup(await AdminDashboardPage());
    expect(html).toContain('href="/dashboard/admin/orders?status=pending&amp;overdue=1&amp;range=all"');
    expect(html).toContain('href="/dashboard/admin/vouchers?filter=expiring"');
    expect(html).toContain('href="/dashboard/admin/users?status=inactive"');
    expect(html).toContain('href="/dashboard/admin/publication?tab=pending"');
    for (const route of ["courses", "orders", "vouchers", "users", "insights", "publication"]) {
      expect(html).toContain(`href="/dashboard/admin/${route}"`);
    }
    expect(html).not.toContain('href="/dashboard/admin/finance"');
    expect(html).toContain("Chưa khả dụng");
    expect(html).toContain("7</span>");
    expect(html).toContain("Số tài khoản, khóa học và đơn hàng được tạo trong kỳ");
    expect(html).not.toContain("DAU");
  });

  it("consumes the accepted voucher URL in the real receiver and uses the shared count predicate", async () => {
    const html = renderToStaticMarkup(await AdminVouchersPage({ searchParams: Promise.resolve({ filter: "expiring" }) }));
    const dialect = new PgDialect();
    expect(dialect.sqlToQuery(state.where.mock.calls[0]![0])).toEqual(dialect.sqlToQuery(nearLimitVoucherPredicate()!));
    expect(html).toContain("Voucher sắp hết lượt");
    expect(html).toContain("đã dùng từ 90% số lượt");
    expect(html).toContain('href="/dashboard/admin/vouchers"');
    expect(html).toContain("0 voucher rows");
  });

  it.each([undefined, "unknown", ["expiring", "other"]])("does not reinterpret unsupported filter %j", async (filter) => {
    await AdminVouchersPage({ searchParams: Promise.resolve({ filter }) });
    expect(state.where).toHaveBeenCalledWith(undefined);
  });

  it.each([AdminDashboardPage, AdminVouchersPage])("denies unauthenticated and non-admin page access before any voucher query", async (Page) => {
    state.session = null;
    await expect(Page({ searchParams: Promise.resolve({}) })).rejects.toThrow("redirect:/login");
    state.session = { user: { id: "learner" } };
    state.roles = ["LEARNER"];
    await expect(Page({ searchParams: Promise.resolve({}) })).rejects.toThrow("redirect:/dashboard");
    expect(state.select).not.toHaveBeenCalled();
  });
});
