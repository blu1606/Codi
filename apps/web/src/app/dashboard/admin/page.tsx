import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getActiveRoles, ROLE } from "@codi-1/auth";
import { auth, db } from "@/services";
import Dashboard, { type DashboardNavItem } from "../dashboard";

const NAV_ITEMS: DashboardNavItem[] = [
  { label: "Quản lý tài khoản người dùng", href: "/dashboard/admin/users" },
  { label: "Duyệt yêu cầu xuất bản khoá học", disabled: true },
  { label: "Đơn hàng & giao dịch", disabled: true },
  { label: "Voucher", disabled: true },
];

export default async function AdminDashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login");

  const active = await getActiveRoles(db, session.user.id);
  if (!active.includes(ROLE.ADMIN)) redirect("/dashboard");

  return <Dashboard session={session} roles={active} navItems={NAV_ITEMS} />;
}
