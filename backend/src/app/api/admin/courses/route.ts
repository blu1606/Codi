import { NextRequest, NextResponse } from "next/server";
import { getActiveRoles, ROLE } from "@codi-1/auth";
import { auth, db } from "@/services";
import { getAdminPublishedCourses } from "@/lib/admin-courses-service";

/** S33 list: published and hidden courses with learner counts. */
export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const active = await getActiveRoles(db, session.user.id);
  if (!active.includes(ROLE.ADMIN)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const courses = await getAdminPublishedCourses(db);
    return NextResponse.json({ courses }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Không tải được danh sách khoá học." }, { status: 500 });
  }
}
