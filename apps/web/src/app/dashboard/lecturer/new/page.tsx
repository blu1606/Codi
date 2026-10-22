import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getActiveRoles, ROLE } from "@codi-1/auth";
import { auth, db } from "@/services";
import { CourseCreateForm } from "./course-create-form";

export default async function NewCoursePage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login");

  const active = await getActiveRoles(db, session.user.id);
  if (!active.includes(ROLE.LECTURER)) redirect("/dashboard");

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      {/* Tiêu đề trang */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Tạo khóa học</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Chỉ cần 4 thông tin cơ bản. Khoá học sẽ được tạo ở trạng thái Bản nháp (draft).
        </p>
      </div>

      <CourseCreateForm />
    </div>
  );
}
