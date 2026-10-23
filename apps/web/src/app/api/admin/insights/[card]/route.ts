import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { getActiveRoles, ROLE } from "@codi-1/auth";
import { auth, db } from "@/services";
import { getAdminCount } from "@/lib/admin-analytics-service";
import { ANALYTICS_UNAVAILABLE, analyticsWindow, type AdminMetric } from "@/lib/analytics-contract";

export async function GET(request: NextRequest, { params }: { params: Promise<{ card: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const active = await getActiveRoles(db, session.user.id);
  if (!active.includes(ROLE.ADMIN)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { card } = await params;
  if (!["users", "courses", "orders"].includes(card)) {
    return NextResponse.json({ status: "unavailable", message: ANALYTICS_UNAVAILABLE }, { status: 404 });
  }
  const period = request.nextUrl.searchParams.get("period") || "30";
  try { analyticsWindow(period); } catch {
    return NextResponse.json({ error: "Invalid period" }, { status: 400 });
  }
  try {
    return NextResponse.json(await getAdminCount(db, card as AdminMetric, period), { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Không tải được thống kê." }, { status: 500 });
  }
}
