import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { getActiveRoles, ROLE } from "@codi-1/auth";
import { auth, db } from "@/services";
import { certificateAction, CertificateError, normalizeCertificateCode } from "@/lib/certificate-contract";
import { actOnCertificate, getCertificate } from "@/lib/certificate-service";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

type Context = { params: Promise<{ code: string }> };
const headers = { "Cache-Control": "private, no-store" };

async function viewerOf(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
  const userId = session?.user?.id ?? null;
  const isAdmin = userId ? (await getActiveRoles(db, userId)).includes(ROLE.ADMIN) : false;
  return { userId, isAdmin };
}

function failure(error: unknown) {
  if (error instanceof CertificateError) return NextResponse.json({ error: error.message }, { status: error.status, headers });
  if (error instanceof ZodError) return NextResponse.json({ error: error.issues[0]?.message ?? "Dữ liệu không hợp lệ." }, { status: 400, headers });
  console.error("[certificates]", error instanceof Error ? error.message : error);
  return NextResponse.json({ error: "Không thể tải chứng chỉ. Vui lòng thử lại." }, { status: 500, headers });
}

/** Public verification: anyone with the code sees the certificate (never the holder's email). */
export async function GET(request: NextRequest, context: Context) {
  // Codes are random (≈10^12), and this bound keeps anyone from walking through them.
  const limit = checkRateLimit(`certificate:${getClientIp(request)}`, { windowMs: 60_000, max: 30 });
  if (!limit.success) return NextResponse.json({ error: "Bạn tra cứu quá nhanh. Vui lòng thử lại sau ít phút." }, { status: 429, headers });
  try {
    const code = normalizeCertificateCode((await context.params).code);
    if (!code) throw new CertificateError("Mã chứng chỉ không đúng định dạng CODI-XXXX-XXXX.", 400);
    return NextResponse.json(await getCertificate(code, await viewerOf(request)), { headers });
  } catch (error) {
    return failure(error);
  }
}

/** { action: "rename", name } by the holder (once); { action: "revoke", reason } / { action: "restore" } by an admin. */
export async function POST(request: NextRequest, context: Context) {
  try {
    if (request.headers.get("origin") !== request.nextUrl.origin) throw new CertificateError("Yêu cầu không hợp lệ.", 403);
    const viewer = await viewerOf(request);
    if (!viewer.userId) throw new CertificateError("Vui lòng đăng nhập.", 401);
    const code = normalizeCertificateCode((await context.params).code);
    if (!code) throw new CertificateError("Mã chứng chỉ không đúng định dạng CODI-XXXX-XXXX.", 400);
    const act = certificateAction.parse(await request.json().catch(() => null));
    return NextResponse.json(await actOnCertificate(code, { ...viewer, userId: viewer.userId }, act), { headers });
  } catch (error) {
    return failure(error);
  }
}
