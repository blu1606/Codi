import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getActiveRoles, ROLE } from "@codi-1/auth";
import { auth, db } from "@/services";
import { getLecturerCourses, getLecturerDashboardStats } from "./actions";
import { LecturerDashboardView } from "./lecturer-dashboard-view";

export default async function LecturerDashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login");

  const active = await getActiveRoles(db, session.user.id);
  if (!active.includes(ROLE.LECTURER)) redirect("/dashboard");

  const { counts, rejectedCourseAlert } = await getLecturerDashboardStats();
  const courses = await getLecturerCourses("all");

  return (
    <LecturerDashboardView
      userName={session.user.name}
      counts={counts}
      rejectedCourseAlert={rejectedCourseAlert}
      courses={courses}
    />
  );
}
