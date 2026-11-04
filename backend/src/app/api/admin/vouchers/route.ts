import { NextRequest, NextResponse } from "next/server";
import { getActiveRoles, ROLE } from "@codi-1/auth";
import { auth, db } from "@/services";
import { getAdminVouchers } from "@/lib/admin-vouchers-service";

/** S35 list; ?filter=expiring keeps the vouchers near their usage limit (dashboard tile). */
export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const active = await getActiveRoles(db, session.user.id);
  if (!active.includes(ROLE.ADMIN)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const filter = request.nextUrl.searchParams.get("filter") === "expiring" ? "expiring" : undefined;
  try {
    const vouchers = await getAdminVouchers(db, filter);
    return NextResponse.json({ vouchers }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Không tải được danh sách voucher." }, { status: 500 });
  }
}
