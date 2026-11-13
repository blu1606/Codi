import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/services";
import { listCertificates } from "@/lib/certificate-service";

const headers = { "Cache-Control": "private, no-store" };

/** The signed-in learner's certificates, newest first. */
export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
  if (!session?.user) return NextResponse.json({ error: "Vui lòng đăng nhập." }, { status: 401, headers });
  try {
    return NextResponse.json({ certificates: await listCertificates(session.user.id) }, { headers });
  } catch (error) {
    console.error("[certificates] list failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Không thể tải danh sách chứng chỉ." }, { status: 500, headers });
  }
}
