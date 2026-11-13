import { NextRequest, NextResponse } from "next/server";
import { getActiveRoles, ROLE } from "@codi-1/auth";
import { auth, db } from "@/services";
import { listAllCertificates } from "@/lib/certificate-service";

/** Every issued certificate (admin only), newest first, with the holder's email for support. */
export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return NextResponse.json({ error: "Vui lòng đăng nhập." }, { status: 401 });
  if (!(await getActiveRoles(db, session.user.id)).includes(ROLE.ADMIN)) return NextResponse.json({ error: "Bạn không có quyền xem trang này." }, { status: 403 });
  try {
    return NextResponse.json({ certificates: await listAllCertificates() }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Không tải được danh sách chứng chỉ." }, { status: 500 });
  }
}
