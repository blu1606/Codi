import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/services";
import { getLearnerStatsData } from "@/lib/learner-insights-service";

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { getActiveRoles, ROLE } = await import("@codi-1/auth");
  const { db } = await import("@/services");
  const activeRoles = await getActiveRoles(db, session.user.id);
  if (!activeRoles.includes(ROLE.LEARNER)) {
    return NextResponse.json({ error: "Forbidden: Yêu cầu vai trò học viên đang hoạt động." }, { status: 403 });
  }

  const url = request.nextUrl;
  const period = (url.searchParams.get("period") as "7" | "month" | "30") || "30";
  const course = url.searchParams.get("course") || "all";

  const data = getLearnerStatsData(period, course, session.user.id);
  return NextResponse.json(data);
}
