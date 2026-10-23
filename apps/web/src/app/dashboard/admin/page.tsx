import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getActiveRoles, ROLE } from "@codi-1/auth";
import { auth, db } from "@/services";
import Dashboard, { type DashboardNavItem } from "../dashboard";

const NAV_ITEMS: DashboardNavItem[] = [
  { label: "Quản lý tài khoản người dùng", href: "/dashboard/admin/users" },
  { label: "Khóa học đã xuất bản", href: "/dashboard/admin/courses" },
  { label: "Duyệt yêu cầu xuất bản khoá học", disabled: true },
  { label: "Đơn hàng & giao dịch", href: "/dashboard/admin/orders" },
  { label: "Voucher", href: "/dashboard/admin/vouchers" },
  { label: "Quan sát hệ thống (Insights)", href: "/dashboard/admin/insights" },
  { label: "Tài chính (Finance)", href: "/dashboard/admin/finance" },
];

export default async function AdminDashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login");

  const active = await getActiveRoles(db, session.user.id);
  if (!active.includes(ROLE.ADMIN)) redirect("/dashboard");

  return <Dashboard session={session} roles={active} navItems={NAV_ITEMS} />;
}
