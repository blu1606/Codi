import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getActiveRoles, ROLE } from "@codi-1/auth";
import { auth, db } from "@/services";
import Dashboard, { type DashboardNavItem } from "../dashboard";

const NAV_ITEMS: DashboardNavItem[] = [
  { label: "Khoá học của tôi", disabled: true },
  { label: "Lộ trình học tập", disabled: true },
  { label: "Tiến độ & kết quả", disabled: true },
];

export default async function LearnerDashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login");

  const active = await getActiveRoles(db, session.user.id);
  if (!active.includes(ROLE.LEARNER)) redirect("/dashboard");

  return <Dashboard session={session} roles={active} navItems={NAV_ITEMS} />;
}
