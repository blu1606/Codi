import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { getActiveRoles, ROLE } from "@codi-1/auth";
import { auth, db } from "@/services";
import { getAdminPublishedCourses } from "@/lib/admin-courses-service";
import { CourseActionsClient } from "./course-actions-client";

export default async function AdminCoursesPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login");

  const active = await getActiveRoles(db, session.user.id);
  if (!active.includes(ROLE.ADMIN)) redirect("/dashboard");

  const courses = await getAdminPublishedCourses(db);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      <div className="flex flex-col gap-2">
        <Link
          href="/dashboard/admin"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-3.5" /> Quay lại Bàn làm việc
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Khóa học đã xuất bản</h1>
          <p className="text-sm text-muted-foreground">
            Ẩn khoá học hoặc đổi giá. Mọi thay đổi đều được thông báo cho giảng viên.
          </p>
        </div>
      </div>

      <CourseActionsClient courses={courses} />
    </div>
  );
}
