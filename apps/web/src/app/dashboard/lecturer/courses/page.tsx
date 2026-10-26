import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getActiveRoles, ROLE } from "@codi-1/auth";
import { auth, db } from "@/services";
import { COURSE_STATUSES, type CourseStatusType } from "@/lib/course-constants";
import {
  getLecturerCourses,
  getLecturerDashboardStats,
} from "../actions";
import { CoursesListView } from "./courses-list-view";

interface CoursesPageProps {
  searchParams: Promise<{ status?: string }>;
}

export default async function LecturerCoursesPage({ searchParams }: CoursesPageProps) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login");

  const active = await getActiveRoles(db, session.user.id);
  if (!active.includes(ROLE.LECTURER)) redirect("/dashboard");

  const resolvedParams = await searchParams;
  const rawStatus = resolvedParams.status;
  const currentStatus: CourseStatusType | "all" =
    rawStatus && COURSE_STATUSES.includes(rawStatus as CourseStatusType)
      ? (rawStatus as CourseStatusType)
      : "all";

  const { counts } = await getLecturerDashboardStats();
  const filteredCourses = await getLecturerCourses(currentStatus);

  return <CoursesListView counts={counts} currentStatus={currentStatus} courses={filteredCourses} />;
}
