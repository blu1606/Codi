import { NextRequest, NextResponse } from "next/server";
import { getActiveRoles } from "@codi-1/auth";
import { auth, db } from "@/services";

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    const roles = session?.user ? await getActiveRoles(db, session.user.id) : [];
    return NextResponse.json({ roles }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Không thể tải quyền truy cập." }, { status: 500 });
  }
}
