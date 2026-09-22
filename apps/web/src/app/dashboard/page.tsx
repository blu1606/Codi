import { getActiveRoles, ROLE } from "@codi-1/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth, db } from "@/services";

export default async function DashboardPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect("/login");
  }

  const active = await getActiveRoles(db, session.user.id);
  if (active.includes(ROLE.ADMIN)) redirect("/dashboard/admin");
  if (active.includes(ROLE.LECTURER)) redirect("/dashboard/lecturer");
  if (active.includes(ROLE.LEARNER)) redirect("/dashboard/learner");

  // zero active roles (e.g. all grants revoked) — never render the generic dashboard
  redirect("/login");
}
