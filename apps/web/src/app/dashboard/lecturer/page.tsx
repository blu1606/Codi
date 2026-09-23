import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getActiveRoles, ROLE } from "@codi-1/auth";
import { auth, db } from "@/services";
import Dashboard, { type DashboardNavItem } from "../dashboard";

const NAV_ITEMS: DashboardNavItem[] = [
  { label: "Soạn thảo khoá học", disabled: true },
  { label: "Chấm bài tập", disabled: true },
  { label: "Tiến độ học viên", disabled: true },
];

export default async function LecturerDashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login");

  const active = await getActiveRoles(db, session.user.id);
  if (!active.includes(ROLE.LECTURER)) redirect("/dashboard");

  return <Dashboard session={session} roles={active} navItems={NAV_ITEMS} />;
}
