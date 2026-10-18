import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { ForbiddenError, requireRole, ROLE } from "@codi-1/auth";
import { createOrderFromCart } from "@/lib/checkout-cart";
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

    let body: any = {};
    try {
      body = await request.json();
    } catch {
      // Body can be empty {}
    }

    const voucherCode = typeof body?.voucherCode === "string" ? body.voucherCode.trim() : undefined;
    const forceReplaceOrderId =
      typeof body?.replaceOrderId === "number" ? body.replaceOrderId : undefined;

    const result = await createOrderFromCart(db, userId, voucherCode, forceReplaceOrderId);
    return NextResponse.json(result, { status: 201 });
  } catch (error: any) {
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: "Chỉ học viên mới có thể đặt hàng" }, { status: 403 });
    }
    const status = typeof error?.status === "number" ? error.status : 400;
    return NextResponse.json(
      { error: error?.message || "Không thể tạo đơn hàng. Vui lòng thử lại.", code: error?.code },
      { status },
    );
  }
}
