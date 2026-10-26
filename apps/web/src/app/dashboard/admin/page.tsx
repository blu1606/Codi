import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getActiveRoles, ROLE } from "@codi-1/auth";
import { auth, db } from "@/services";
import { getAdminDashboardData } from "./actions";
import { AdminDashboardView } from "./admin-dashboard-view";
import { DemoDataBadge } from "@/demo-fixtures/demo-fallback-provider";
import { withDemoFallback } from "@/demo-fixtures/demo-mode";
import { adminDashboardData } from "@/demo-fixtures/commerce/s30-admin-dashboard";

export default async function AdminDashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login");

  const active = await getActiveRoles(db, session.user.id);
  if (!active.includes(ROLE.ADMIN)) redirect("/dashboard");

  const { data, demo } = await withDemoFallback(getAdminDashboardData, () => adminDashboardData);
  return <>{demo && <DemoDataBadge />}<AdminDashboardView data={data} /></>;
}
