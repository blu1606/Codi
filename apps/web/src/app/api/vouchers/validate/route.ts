import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { ForbiddenError, requireRole, ROLE } from "@codi-1/auth";
import { vouchers } from "@codi-1/db";
import { getCartSummary, validateVoucher } from "@/lib/cart-service";
import { auth, db } from "@/services";

export async function POST(request: Request) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      return NextResponse.json({ error: "Vui lòng đăng nhập" }, { status: 401 });
    }
    const userId = session.user.id;
    await requireRole(db, userId, ROLE.LEARNER);

    if (request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/json") {
      return NextResponse.json({ error: "Yêu cầu Content-Type application/json" }, { status: 415 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "JSON không hợp lệ" }, { status: 400 });
    }

    if (
      typeof body !== "object" ||
      body === null ||
      !("code" in body) ||
      typeof body.code !== "string"
    ) {
      return NextResponse.json({ error: "Mã giảm giá không hợp lệ" }, { status: 400 });
    }

    const code = body.code.trim().toUpperCase();
    if (!code) {
      return NextResponse.json({ error: "Nhập mã giảm giá trước khi bấm Áp dụng." }, { status: 400 });
    }

    const summary = await getCartSummary(db, userId);
    const subtotal = summary.subtotal;

    const [voucherRow] = await db
      .select()
      .from(vouchers)
      .where(eq(vouchers.code, code))
      .limit(1);

    const result = validateVoucher(voucherRow, subtotal);
    if (!result.valid) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ valid: true, voucher: result.voucher }, { status: 200 });
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: "Chỉ học viên mới có thể áp dụng mã giảm giá" }, { status: 403 });
    }
    return NextResponse.json({ error: "Không thể kiểm tra mã giảm giá. Vui lòng thử lại." }, { status: 500 });
  }
}
