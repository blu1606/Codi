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
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Tạo khóa học</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Chỉ cần 4 thông tin. Khoá học được tạo ở trạng thái Bản nháp.
        </p>
      </div>

      <CourseCreateForm />
    </div>
  );
}
